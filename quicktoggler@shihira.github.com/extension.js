/*
 * Developer: Shihira Fung <fengzhiping@hotmail.com>
 * Date: Apr 27, 2016
 * License: GPLv2
 */

const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Core = Me.imports.core;
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

const LOGGER_INFO = 0;
const LOGGER_WARNING = 1;
const LOGGER_ERROR = 2;

const Logger = new Lang.Class({
    Name: 'Logger',

    _init: function(log_file) {
        this._log_file = log_file;
        // initailize log_backend
        if(!log_file)
            this._initEmptyLog();
        else if(log_file == "gnome-shell")
            this._initGnomeLog();
        else
            this._initFileLog();

        this.level = LOGGER_WARNING;

        this.info = function(t) {
            if(this.level <= LOGGER_INFO) this.log(t)
        };
        this.warning = function(t) {
            if(this.level <= LOGGER_WARNING) this.log(t)
        };
        this.error = function(t) {
            if(this.level <= LOGGER_ERROR) this.log(t);
        };
    },

    _initEmptyLog: function() {
        this.log = function(_) { };
    },

    _initGnomeLog: function() {
        this.log = function(s) {
            global.log("[QuickToggler] " + s);
        };
    },

    _initFileLog: function() {
        this.log = function(s) {
            // all operations are synchronous: any needs to optimize?
            if(!this._output_file || !this._output_file.query_exists(null) ||
                !this._fstream || this._fstream.is_closed()) {

                this._output_file = Gio.File.new_for_path(this._log_file);
                this._fstream = this._output_file.append_to(
                    Gio.FileCreateFlags.NONE, null);

                if(!this._fstream instanceof Gio.FileIOStream) {
                    this._initGnomeLog();
                    this.log("IOError: Failed to append to " + this._log_file +
                            " [Gio.IOErrorEnum:" + this._fstream + "]");
                    return;
                }
            }

            this._fstream.write(String(new Date())+" "+s+"\n", null);
            this._fstream.flush(null);
        }
    },
});

let logger = null;

// lazy-evaluation
function getLogger() {
    if(logger === null)
        logger = new Logger("gnome-shell");
    return logger;
}

function errorToString(e) {
    if(e instanceof GLib.Error)
        return "GLib.Error(" + e.code + ") " + e.message;
    if(e instanceof Error)
        return e.toString() + "\n" + e.stack;
    return e.toString();
}

const SearchBox = new Lang.Class({
    Name: 'SearchBox',

    _init: function() {
        this.actor = new St.BoxLayout({ style_class: 'search-box' });
        this.search = new St.Entry({
                hint_text: "Filter",
                x_expand: true,
                y_expand: true,
        });

        this.actor.add(this.search);

        this.search.connect('key-release-event',
            Lang.bind(this, this._onKeyReleaseEvent));
    },

    _onKeyReleaseEvent: function(_, ev) {
        let text = this.search.get_text().toString();
        let selected = ev.get_key_symbol() == Clutter.KEY_Return;
        if(!text) {
            // do not perform any searching for empty string.
            this._callback()([], selected);
        } else {
            let ret_ent = this.searchEntries(this.entries, text);
            this._callback()(ret_ent, selected);
        }
    },

    setSearch: function(entries, callback) {
        this._callback = function() { return callback };
        this.entries = entries;
    },

    searchEntries: function(entries, pattern) {
        let return_list = [];
        for(let e in entries) {
            // For entries that have a member `entries`, we enter it(recursion).
            // For entries that have a member `perform`, we match it.
            let entry = entries[e];

            if(entry.entries) {
                return_list = return_list.concat(
                    this.searchEntries(entry.entries, pattern));
                continue;
            }

            if(entry.perform && this.matchText(entry.title, pattern)) {
                return_list.push(entry);
            }
        }

        return return_list;
    },

    matchText: function(title, pattern) {
        // construct regexp pattern: fuzzy search
        let regex_sec = [];
        regex_sec.push(".*\\b");
        for(let c_i = 0; c_i < pattern.length; ++c_i) {
            let c = pattern[c_i];
            let code = "\\x" + c.charCodeAt().toString(16);
            let sec = "(.*\\b"+code+"|"+code+")";

            regex_sec.push(sec);
        }
        regex_sec.push(".*");

        let regex = new RegExp(regex_sec.join(""), "i");

        return regex.test(title);
    },

    reset: function() {
        this.search.set_text("");
    },
});

// a global instance of Logger, created when initing indicator
const TogglerIndicator = new Lang.Class({
    Name: 'TogglerIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(St.Align.START);
        this._loadSettings();

        this.search_mode = false;
    },

    _loadSettings: function() {
        this._settings = new Convenience.getSettings();

        this._loadLogger();
        this._loadIcon();
        this._loadConfig();
        this._loadPulser();
        this._loadShortcut();
    },

    _loadLogger: function() {
        let log_file = this._settings.get_string(Prefs.LOG_FILE);

        logger = new Logger(log_file);
    },

    _loadIcon: function() {
        let icon_name = this._settings.get_string(Prefs.INDICATOR_ICON);

        if(!this._icon) {
            this._icon = new St.Icon({
                icon_name: icon_name,
                style_class: 'system-status-icon'
            });
            this.actor.add_actor(this._icon);
        } else {
            this._icon.set_icon_name(icon_name);
        }
    },

    _loadConfig: function() {
        try {
            let entries_file = this._settings.get_string(Prefs.ENTRIES_FILE);
            entries_file = entries_file || (Me.path + "/entries.json");

            if(!this._config_loader)
                this.config_loader = new Core.ConfigLoader();
            this.config_loader.loadConfig(entries_file);

            this.menu.removeAll();

            for(let i in this.config_loader.entries) {
                let item = this.config_loader.entries[i].createItem();
                this.menu.addMenuItem(item);
            }
        } catch(e) {
            getLogger().error("Error while loading entries:");
            getLogger().error(errorToString(e));
            Main.notify("An error occurs when loading entries.",
                errorToString(e));
        }

        if(!this.searchBox) {
            this.searchBox = new SearchBox();
            this.menu.box.insert_child_at_index(this.searchBox.actor, 0);
            this.searchBox.setSearch(this.config_loader.entries,
                Lang.bind(this, this._gotSearchResult));
        }
    },

    _loadPulser: function() {
        let interval = this._settings.get_int(Prefs.DETECTION_INTERVAL);

        if(!this._pulser) {
            this._pulser = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval,
                Lang.bind(this, this.pulse));
        } else {
            GLib.Source.remove(this._pulser);
            this._pulser = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval,
                Lang.bind(this, this.pulse));
        }

        this.pulse();
    },

    _loadShortcut: function() {
        // introduce in different version of GNOME
        let kbmode = Shell.ActionMode || Shell.KeyBindingMode || Main.KeybindingMode;

        global.log("Kill");
        global.log(this);
        Main.wm.addKeybinding(Prefs.MENU_SHORTCUT, this._settings,
            Meta.KeyBindingFlags.NONE,
            kbmode.NORMAL | kbmode.MESSAGE_TRAY,
            Lang.bind(this, function() {
                this.menu.toggle();
                this.searchBox.search.grab_key_focus();
            }));
    },

    _onOpenStateChanged: function(menu, open) {
        this.parent(menu, open);

        if(open) {
            this.searchBox.reset();
            this._gotSearchResult([], false);
        }
    },

    pulse: function() {
        try {
            for(let i in this.config_loader.entries) {
                let conf = this.config_loader.entries[i];
                conf.pulse();
            }
        } catch(e) {
            getLogger().error("Error during pulse routines (id " +
                    this._pulser + ")");
            getLogger().error(errorToString(e));
        }
        return true;
    },

    _gotSearchResult: function(result, selected) {
        // If confirmed, close the menu directly
        if(selected) {
            if(result[0])
                result[0].perform();
            this.menu.toggle();
            return;
        }

        // If result is empty, exit search mode
        if(result.length) {
            this.search_mode = true;

            this.menu.removeAll();
            for(let i in result) {
                let item = result[i].createItem();
                this.menu.addMenuItem(item);
            }
        } else {
            if(!this.search_mode)
                return;

            this.search_mode = false;
            this.menu.removeAll();
            for(let i in this.config_loader.entries) {
                let item = this.config_loader.entries[i].createItem();
                this.menu.addMenuItem(item);
            }
        }
    },

    destroy: function() {
        Main.wm.removeKeybinding(Prefs.MENU_SHORTCUT);

        this.parent();
    },
});

////////////////////////////////////////////////////////////////////////////////
// Entries

let indicator;

function init() {
}

function enable() {
    indicator = new TogglerIndicator();
    Main.panel.addToStatusArea("QuickToggler", indicator);
}

function disable() {
    indicator.destroy();
}

