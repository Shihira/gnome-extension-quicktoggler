const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Json = imports.gi.Json;
const Lang = imports.lang;

const PopupMenu = imports.ui.popupMenu;

const Entry = new Lang.Class({
    Name: 'Entry',
    Abstract: true,

    _init: function(prop) {
        if(!prop.type)
            throw new Error("No type specified in entry.");
        if(!prop.title)
            throw new Error("No title specified in entry.");

        this.type = prop.type;
        this.title = prop.title;
    },

    setTitle: function(text) {
        this.item.label_actor.set_text(text);
    },

    pulse: function() { },
});

let launcher = new Gio.SubprocessLauncher({
    flags:
        Gio.SubprocessFlags.STDIN_PIPE |
        Gio.SubprocessFlags.STDOUT_PIPE |
        Gio.SubprocessFlags.STDERR_PIPE
});

function pipeOpen(cmdline, callback, sync) {
    let proc = launcher.spawnv(['bash', '-c', cmdline]);
    let user_cb = callback;

    function wait_cb(_, _res) {
        let pipe = proc.get_stdout_pipe();
        let stdout_content = "";
        while(true) {
            let bytes = pipe.read_bytes(1, null);
            if(bytes.get_size() == 0) break;
            stdout_content += bytes.get_data();
        }

        if(user_cb)
            user_cb(stdout_content);
    }

    if(sync) {
        proc.wait(null);
        wait_cb(proc, null);
    } else {
        proc.wait_async(null, wait_cb);
    }

    return proc.get_identifier();
}

const TogglerEntry = new Lang.Class({
    Name: 'TogglerEntry',
    Extends: Entry,

    _init: function(prop) {
        this.parent(prop);

        this.command_on = prop.command_on || "";
        this.command_off = prop.command_off || "";
        this.detector = prop.detector || "";

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
        pipeOpen(this.detector, function(out) {
            out = String(out);
            callback(!Boolean(out.match(/^\s*$/)));
        }, sync);
    },

    pulse: function() {
        this._detect(Lang.bind(this, function(state) {
            this.item.setToggleState(state);
        }));
    },
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

const type_map = {
    launcher: LauncherEntry,
    toggler: TogglerEntry,
};

const ConfigLoader = new Lang.Class({
    Name: 'ConfigLoader',

    _init: function(filename) {
        this.config = [];

        if(filename)
            this.loadConfig(filename);
    },

    loadConfig: function(filename) {
        let config_parser = new Json.Parser();
        config_parser.load_from_file(filename);

        let root = config_parser.get_root();
        let entries = root.get_object().get_member("entries").get_array();

        entries.foreach_element(Lang.bind(this, function(_, i, elem) {
            let entry_prop = { };
            elem.get_object().foreach_member(function(_, key, val) {
                entry_prop[key] = val.get_string();
            });
            this.config.push(new type_map[entry_prop.type](entry_prop))
        }));
    },
});

