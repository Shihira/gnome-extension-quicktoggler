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

        this.__vars = prop.__vars || [];
        this.updateEnv(prop);
    },

    setTitle: function(text) {
        this.item.label.get_clutter_text().set_text(text);
    },

    updateEnv: function(prop) {
        this.__env = {}
        if(!this.__vars) return;

        for(let i in this.__vars) {
            let v = this.__vars[i];
            this.__env[v] = prop[v] ? String(prop[v]) : "";
        }
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

const DerivedEntry = new Lang.Class({
    Name: 'DerivedEntry',

    _init: function(prop) {
        if(!prop.base)
            throw new Error("Base entry not specified in type definition.");

        this.base = prop.base;
        this.vars = prop.vars || [];

        delete prop.base;
        delete prop.vars;

        this.prop = prop;
    },

    createInstance: function(addit_prop) {
        let cls = type_map[this.base];
        if(!cls) throw new Error("Bad base class.");
        if(cls.createInstance) throw new Error("Not allowed to derive from dervied types");

        for(let rp in this.prop)
            addit_prop[rp] = this.prop[rp];
        addit_prop.__vars = this.vars;

        let instance = new cls(addit_prop);

        return instance;
    },
});

/*
 * callback: function (stdout, stderr, exit_status) { }
 */
let __pipeOpenQueue = [];
let __pipeExecTimer = null;

function pipeOpen(cmdline, env, callback) {
    let param = [cmdline, env, callback]
    __pipeOpenQueue.push(param);
    if(__pipeExecTimer === null) {
        __pipeExecTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50,
            function() {
            let param = __pipeOpenQueue.shift();
            if(param === undefined) {
                __pipeExecTimer = null;
                return false;
            }
            if(realPipeOpen) realPipeOpen(param[0], param[1], param[2]);
            return true;
        });

    }
}

function realPipeOpen(cmdline, env, callback) {
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
        let _pipedLauncher = new Gio.SubprocessLauncher({
            flags:
                Gio.SubprocessFlags.STDERR_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE
        });
        for(let key in env) {
            _pipedLauncher.setenv(key, env[key], true);
        }
        proc = _pipedLauncher.spawnv(['bash', '-c', cmdline]);
        proc.wait_async(null, wait_cb);
    } else {
        // Detached launcher is used to spawn commands that we are not concerned
        // about its result.
        let _detacLauncher = new Gio.SubprocessLauncher();
        for(let key in env) {
            _detacLauncher.setenv(key, env[key], true);
        }
        proc = _detacLauncher.spawnv(['bash', '-c', cmdline]);
    }

    getLogger().info("Spawned " + cmdline);

    return proc.get_identifier();
}

function _generalSpawn(command, env, title) {
    title = title || "Process";
    pipeOpen(command, env, function(stdout, stderr, exit_status) {
        if(exit_status != 0) {
            getLogger().warning(stderr);
            getLogger().notify("proc", title +
                " exited with status " + exit_status, stderr);
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
        this.notify_when = prop.notify_when || [];
        // if the switch is manually turned off, auto_on is disabled.
        this._manually_switched_off = false;
    },

    createItem: function() {
        this._try_destroy();

        this.item = new PopupMenu.PopupSwitchMenuItem(this.title, false);
        this.item.label.get_clutter_text().set_use_markup(true);
        this.item.connect('toggled', Lang.bind(this, this._onManuallyToggled));

        this._loadState();

        return this.item;
    },

    _onManuallyToggled: function(_, state) {
        // when switched on again, this flag will get cleared.
        this._manually_switched_off = !state;
        this._storeState(state);
        this._onToggled(state);
    },

    _onToggled: function(state) {
        if(state)
            _generalSpawn(this.command_on, this.__env, this.title);
        else
            _generalSpawn(this.command_off, this.__env, this.title);
    },

    _detect: function(callback) {
        // abort detecting if detector is an empty string
        if(!this.detector)
            return;

        pipeOpen(this.detector, this.__env, function(out) {
            out = String(out);
            callback(!Boolean(out.match(/^\s*$/)));
        });
    },

    compareState: function(new_state) {
        // compare the new state with cached state
        // notify when state is different
        let old_state = _toggler_state_cache[this.detector];
        if(old_state === undefined) return;
        if(old_state == new_state) return;

        if(this.notify_when.indexOf(new_state ? "on" : "off") >= 0) {
            let not_str = this.title + (new_state ? " started." : " stopped.");
            if(!new_state && this.auto_on)
                not_str += " Attempt to restart it now.";
            getLogger().notify("state", not_str);
        }
    },

    _storeState: function(state) {
        let hash = JSON.stringify({ env: this.__env, detector: this.detector });
        _toggler_state_cache[hash] = state;
    },

    _loadState: function() {
        let hash = JSON.stringify({ env: this.__env, detector: this.detector });
        let state = _toggler_state_cache[hash]; 
        if(state !== undefined)
            this.item.setToggleState(state); // doesn't emit 'toggled'
    },

    pulse: function() {
        this._detect(Lang.bind(this, function(state) {
            this.compareState(state);

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
        _generalSpawn(this.command, this.__env, this.title);
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

let type_map = {};

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

//
function createEntry(entry_prop) {
    if(!entry_prop.type)
        throw new Error("No type specified in entry.");

    let cls = type_map[entry_prop.type];
    if(!cls)
        throw new Error("Incorrect type '" + entry_prop.type + "'");
    else if(cls.createInstance)
        return cls.createInstance(entry_prop);

    return new cls(entry_prop);
}

const ConfigLoader = new Lang.Class({
    Name: 'ConfigLoader',

    _init: function(filename) {
        if(filename)
            this.loadConfig(filename);
    },

    loadConfig: function(filename) {
        // reset type_map everytime load the config
        type_map = {
            launcher: LauncherEntry,
            toggler: TogglerEntry,
            submenu: SubMenuEntry,
            separator: SeparatorEntry
        };

        type_map.systemd = new DerivedEntry({
            base: 'toggler',
            vars: ['unit'],
            command_on: "pkexec systemctl start ${unit}",
            command_off: "pkexec systemctl stop ${unit}",
            detector: "systemctl status ${unit} | grep Active:\\\\s\\*activ[ei]",
        });

        type_map.tmux = new DerivedEntry({
            base: 'toggler',
            vars: ['command', 'session'],
            command_on: 'tmux new -d -s ${session} bash -c "${command}"',
            command_off: 'tmux kill-session -t ${session}',
            detector: 'tmux has -t "${session}" 2>/dev/null && echo yes',
        });

        /*
         * Refer to README file for detailed config file format.
         */
        this.entries = []; // CAUTION: remove all entries.

        let config_parser = new Json.Parser();
        config_parser.load_from_file(filename);

        let conf = convertJson(config_parser.get_root());
        if(conf.entries == undefined)
            throw new Error("Key 'entries' not found.");
        if(conf.deftype) {
            for(let tname in conf.deftype) {
                if(type_map[tname])
                    throw new Error("Type \""+tname+"\" duplicated.");
                type_map[tname] = new DerivedEntry(conf.deftype[tname]);
            }
        }

        for(let conf_i in conf.entries) {
            let entry_prop = conf.entries[conf_i];
            this.entries.push(createEntry(entry_prop));
        }
    },
});

