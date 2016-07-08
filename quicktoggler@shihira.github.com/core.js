const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Json = imports.gi.Json;
const Lang = imports.lang;
const Main = imports.ui.main;

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
        this.item.label.get_clutter_text().set_text(text);
    },

    // the pulse function should be read as "a pulse arrives"
    pulse: function() { },

    _try_destroy: function() {
        try {
            if(this.item && this.item.destroy)
                this.item.destroy();
        } catch(e) { /* Ignore all errors during destory*/ }
    },
});


let _pipedLauncher = new Gio.SubprocessLauncher({
    flags:
        Gio.SubprocessFlags.STDERR_PIPE |
        Gio.SubprocessFlags.STDOUT_PIPE
});
// Detached launcher is used to spawn commands that we are not concern about its
// result.
let _detacLauncher = new Gio.SubprocessLauncher();

/*
 * callback: function (stdout, stderr, exit_status) { }
 */
function pipeOpen(cmdline, callback) {
    let user_cb = callback;
    let proc;

    function wait_cb(_, _res) {
        let stdout_pipe = proc.get_stdout_pipe();
        let stderr_pipe = proc.get_stderr_pipe();

        let stdout_content;
        let stderr_content;

        // Only the first GLib.MAXINT16 characters are fetched for optimization.
        stdout_pipe.read_bytes_async(GLib.MAXINT16, 0, null, function(osrc, ores) {
            stdout_content = String(stdout_pipe.read_bytes_finish(ores).get_data());
            stdout_pipe.close(null);

            stderr_pipe.read_bytes_async(GLib.MAXINT16, 0, null, function(esrc, eres) {
                stderr_content = String(stderr_pipe.read_bytes_finish(eres).get_data());
                stderr_pipe.close(null);

                user_cb(stdout_content, stderr_content, proc.get_exit_status());
            });
        });
    }

    if(user_cb) {
        proc = _pipedLauncher.spawnv(['bash', '-c', cmdline]);
        proc.wait_async(null, wait_cb);
    } else {
        proc = _detacLauncher.spawnv(['bash', '-c', cmdline]);
    }

    getLogger().info("Spawned " + cmdline);

    return proc.get_identifier();
}

function _generalSpawn(command) {
    pipeOpen(command, function(stdout, stderr, exit_status) {
        if(exit_status != 0) {
            Main.notify("Process exited with status " + exit_status, stderr);
            getLogger().warning(stderr);
        }
    });
}

function quoteShellArg(arg) {
    arg = arg.replace(/'/g, "'\"'\"'");
    return "'" + arg + "'";
}

// This cache is used to reduce detector cost. Each time creating an item, it
// check if the result of this detector is cached, which prevent the togglers
// from running detector on each creation. This is useful especially in search
// mode.
let _toggler_state_cache = { };

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
    },

    createItem: function() {
        this._try_destroy();

        this.item = new PopupMenu.PopupSwitchMenuItem(this.title);
        this.item.label.get_clutter_text().set_use_markup(true);
        this.item.connect('toggled', Lang.bind(this, this._onManuallyToggled));

        this._loadState();

        return this.item;
    },

    _onManuallyToggled: function(_, state) {
        // when switched on again, this flag will get cleared.
        this._manually_switched_off = !state;
        this._onToggled(state);
    },

    _onToggled: function(state) {
        if(state)
            _generalSpawn(this.command_on);
        else
            _generalSpawn(this.command_off);
    },

    _detect: function(callback) {
        // abort detecting if detector is an empty string
        if(!this.detector)
            return;

        pipeOpen(this.detector, function(out) {
            out = String(out);
            callback(!Boolean(out.match(/^\s*$/)));
        });
    },

    _storeState: function(state) {
        _toggler_state_cache[this.detector] = state;
    },

    _loadState: function() {
        let state = _toggler_state_cache[this.detector]; 
        if(state != undefined)
            this.item.setToggleState(state); // doesn't emit 'toggled'
    },

    pulse: function() {
        this._detect(Lang.bind(this, function(state) {
            this._storeState(state);
            this._loadState();
            //global.log(this.title + ': ' + this._manually_switched_off);

            if(!state && !this._manually_switched_off && this.auto_on)
                // do not call setToggleState here, because command_on may fail
                this._onToggled(this.item, true);
        }));
    },

    perform: function() {
        this.item.toggle();
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
            quoteShellArg(prop.unit) + " | grep Active:\\\\s\\*activ[ei]";

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
    },

    createItem: function() {
        this._try_destroy();

        this.item = new PopupMenu.PopupMenuItem(this.title);
        this.item.label.get_clutter_text().set_use_markup(true);
        this.item.connect('activate', Lang.bind(this, this._onClicked));

        return this.item;
    },

    _onClicked: function(_) {
        _generalSpawn(this.command);
    },

    perform: function() {
        this.item.emit('activate');
    },
});

const SubMenuEntry = new Lang.Class({
    Name: 'SubMenuEntry',
    Extends: Entry,

    _init: function(prop) {
        this.parent(prop)

        if(prop.entries == undefined)
            throw new Error("Expected entries provided in submenu entry.");

        this.entries = [];

        for(let i in prop.entries) {
            let entry_prop = prop.entries[i];
            let entry = createEntry(entry_prop);
            this.entries.push(entry);
        }
    },

    createItem: function() {
        this._try_destroy();

        this.item = new PopupMenu.PopupSubMenuMenuItem(this.title);
        this.item.label.get_clutter_text().set_use_markup(true);
        for(let i in this.entries) {
            let entry = this.entries[i];
            this.item.menu.addMenuItem(entry.createItem());
        }

        return this.item;
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

    _init: function(prop) { },

    createItem: function() {
        this._try_destroy();

        this.item = new PopupMenu.PopupSeparatorMenuItem(this.title);
        this.item.label.get_clutter_text().set_use_markup(true);

        return this.item;
    },
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

