const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Json = imports.gi.Json;
const Lang = imports.lang;

const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const getLogger = Me.imports.extension.getLogger;

const Entry = new Lang.Class({
    Name: 'Entry',
    Abstract: true,

    _init: function(prop) {
        this.type = prop.type;
        this.title = prop.title || "";
    },

    setTitle: function(text) {
        this.item.label_actor.set_text(text);
    },

    // the pulse function should be read as "a pulse arrives"
    pulse: function() { },
});

/*
 * Use bash -c '...' to spawn a command asynchronously. When finished, callback
 * will get called, you can choose the synchronicity by setting sync to true. If
 * callback is not specified, the command state will not be tracked any more.
 */

let _launcher = new Gio.SubprocessLauncher({
    flags:
        //Gio.SubprocessFlags.STDIN_PIPE |
        //Gio.SubprocessFlags.STDERR_PIPE |
        Gio.SubprocessFlags.STDOUT_PIPE
});

function pipeOpen(cmdline, callback, sync) {
    let proc = _launcher.spawnv(['bash', '-c', cmdline]);
    let user_cb = callback;

    function wait_cb(_, _res) {
        let pipe = proc.get_stdout_pipe();
        let stdout_content = "";
        while(true) {
            let bytes = pipe.read_bytes(1, null);
            if(bytes.get_size() == 0) break;
            stdout_content += bytes.get_data();
        }
        pipe.close(null);

        // no need to check user_cb. If user_cb doesn't exist, there's even no
        // chance for wait_cb to execute.
        user_cb(stdout_content);
    }

    if(user_cb) {
        if(sync) {
            proc.wait(null);
            wait_cb(proc, null);
        } else {
            proc.wait_async(null, wait_cb);
        }
    } else
        //
        proc.get_stdout_pipe().close(null);

    getLogger().info("Spawned " + cmdline);

    return proc.get_identifier();
}

function quoteShellArg(arg) {
    arg = arg.replace(/'/g, "'\"'\"'");
    return "'" + arg + "'";
}

const TogglerEntry = new Lang.Class({
    Name: 'TogglerEntry',
    Extends: Entry,

    _init: function(prop) {
        this.parent(prop);

        this.command_on = prop.command_on || "";
        this.command_off = prop.command_off || "";
        this.detector = prop.detector || "";
        this.auto_on = prop.auto_on || false;
        // if the switch is manually turned off, auto_on is disabled.
        this._manually_switched_off = false;

        this.item = new PopupMenu.PopupSwitchMenuItem(this.title);
        this.item.connect('toggled', Lang.bind(this, this._onToggled));
    },

    _onToggled: function(_, state) {
        if(state)
            pipeOpen(this.command_on);
        else
            pipeOpen(this.command_off);
    },

    _detect: function(callback, sync) {
        // abort detecting if detector is an empty string
        if(!this.detector)
            return;

        pipeOpen(this.detector, function(out) {
            out = String(out);
            callback(!Boolean(out.match(/^\s*$/)));
        }, sync);
    },

    pulse: function() {
        this._detect(Lang.bind(this, function(state) {
            this.item.setToggleState(state);

            if(!state && this.auto_on)
                // do not call setToggleState here, because command_on may fail
                this._onToggled(this.item, true);
        }));
    },
});

const SystemdEntry = new Lang.Class({
    Name: 'SystemdEntry',
    Extends: TogglerEntry,

    _init: function(prop) {
        if(!prop.unit)
            throw new Error("Unit not specified in systemd entry.");
        prop.command_on = "pkexec systemctl start " +
            quoteShellArg(prop.unit);
        prop.command_off = "pkexec systemctl stop " +
            quoteShellArg(prop.unit);
        prop.detector = "systemctl status " +
            quoteShellArg(prop.unit) + " | grep running";

        this.parent(prop);
    }
});

const TmuxEntry = new Lang.Class({
    Name: 'TmuxEntry',
    Extends: TogglerEntry,

    _init: function(prop) {
        if(!prop.session)
            throw new Error("Session Id not specified in tmux entry");
        prop.command = prop.command || "";
        prop.command_on = "tmux new -d -s " +
            quoteShellArg(prop.session) + " bash -c " +
            quoteShellArg(prop.command);
        prop.command_off = "tmux kill-session -t " +
            quoteShellArg(prop.session);
        prop.detector = "tmux ls | grep " + quoteShellArg(prop.session);

        this.parent(prop);
    }
});

const LauncherEntry = new Lang.Class({
    Name: 'LauncherEntry',
    Extends: Entry,

    _init: function(prop) {
        this.parent(prop);

        this.command = prop.command || "";

        this.item = new PopupMenu.PopupMenuItem(this.title);
        this.item.connect('activate', Lang.bind(this, this._onClicked));
    },

    _onClicked: function(_) {
        pipeOpen(this.command);
    }
});

const SubMenuEntry = new Lang.Class({
    Name: 'SubMenuEntry',
    Extends: Entry,

    _init: function(prop) {
        this.parent(prop)

        if(prop.entries == undefined)
            throw new Error("Expected entries provided in submenu entry.");

        this.entries = [];
        this.item = new PopupMenu.PopupSubMenuMenuItem(this.title);

        for(let i in prop.entries) {
            let entry_prop = prop.entries[i];
            let item = createEntry(entry_prop);

            this.entries.push(item);
            this.item.menu.addMenuItem(item.item);
        }
    },

    pulse: function() {
        for(let i in this.entries) {
            let entry = this.entries[i];
            entry.pulse();
        }
    }
});

const SeparatorEntry = new Lang.Class({
    Name: 'SeparatorEntry',
    Extends: Entry,

    _init: function(prop) {
        this.item = new PopupMenu.PopupSeparatorMenuItem(this.title);
    }
});

const type_map = {
    launcher: LauncherEntry,
    toggler: TogglerEntry,
    submenu: SubMenuEntry,
    systemd: SystemdEntry,
    tmux: TmuxEntry,
    separator: SeparatorEntry,
};

////////////////////////////////////////////////////////////////////////////////
// Config Loader loads config from JSON file.

// convert Json Nodes (GLib based) to native javascript value.
function convertJson(node) {
    if(node.get_node_type() == Json.NodeType.VALUE)
        return node.get_value();
    if(node.get_node_type() == Json.NodeType.OBJECT) {
        let obj = {}
        node.get_object().foreach_member(function(_, k, v_n) {
            obj[k] = convertJson(v_n);
        });
        return obj;
    }
    if(node.get_node_type() == Json.NodeType.ARRAY) {
        let arr = []
        node.get_array().foreach_element(function(_, i, elem) {
            arr.push(convertJson(elem));
        });
        return arr;
    }
    return null;
}

function createEntry(entry_prop) {
    if(!entry_prop.type)
        throw new Error("No type specified in entry.");
    if(!type_map[entry_prop.type])
        throw new Error("Incorrect type '" + entry_prop.type + "'");

    return new type_map[entry_prop.type](entry_prop)
}

const ConfigLoader = new Lang.Class({
    Name: 'ConfigLoader',

    _init: function(filename) {
        if(filename)
            this.loadConfig(filename);
    },

    loadConfig: function(filename) {
        /*
         * Refer to README file for detailed config file format.
         */
        this.entries = []; // CAUTION: remove all entries.

        let config_parser = new Json.Parser();
        config_parser.load_from_file(filename);

        let conf = convertJson(config_parser.get_root());
        if(conf.entries == undefined)
            throw new Error("Key 'entries' not found.");

        for(let conf_i in conf.entries) {
            let entry_prop = conf.entries[conf_i];
            this.entries.push(createEntry(entry_prop));
        }
    },
});


