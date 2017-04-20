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

const Gettext = imports.gettext.domain("gnome-extension-quicktoggler");
const _ = Gettext.gettext;

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

    notify: function(t, str, details) {
        this.ncond = this.ncond || ['proc', 'ext', 'state'];
        if(this.ncond.indexOf(t) < 0) return;
        Main.notify(str, details || "");
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
                hint_text: _("Filter"),
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

    get_layout: function() {
        if(!this._layout) {
            this._layout = new St.BoxLayout();
            this.actor.add_actor(this._layout);
        }
        return this._layout;
    },

    _loadSettings: function() {
        this._settings = new Convenience.getSettings();

        this._loadLogger(); // load first
        this._loadIcon();
        this._loadText();
        this._loadConfig();
        this._loadSearchBar();
        this._loadPulser();
        this._loadShortcut();

        this._settings.connect('changed', Lang.bind(this, function(_, key) {
            let loaders = {};
            loaders[Prefs.LOG_FILE]             = "_loadLogger";
            loaders[Prefs.NOTIFICATION_COND]    = "_loadLogger";
            loaders[Prefs.INDICATOR_ICON]       = "_loadIcon";
            loaders[Prefs.INDICATOR_TEXT]       = "_loadText";
            loaders[Prefs.ENTRIES_FILE]         = "_loadConfig";
            loaders[Prefs.DETECTION_INTERVAL]   = "_loadPulser";

            if(loaders[key])
                this[loaders[key]]();
        }));
    },

    _loadLogger: function() {
        let log_file = this._settings.get_string(Prefs.LOG_FILE);

        logger = new Logger(log_file);
        logger.ncond = this._settings.get_strv(Prefs.NOTIFICATION_COND);
    },

    _loadIcon: function() {
        let icon_name = this._settings.get_string(Prefs.INDICATOR_ICON);

        if(!this._icon) {
            this._icon = new St.Icon({
                icon_name: icon_name,
                style_class: 'system-status-icon'
            });
            this.get_layout().add_child(this._icon);
        } else {
            this._icon.set_icon_name(icon_name);
        }
    },

    _loadText: function() {
        let text = this._settings.get_string(Prefs.INDICATOR_TEXT);

        if(!this._text) {
            this._text = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._text.set_y_expand(true);
            this._text.clutter_text.set_use_markup(true);
            this.get_layout().add_child(this._text);
        }

        if(this._text.clutter_text && this._text.clutter_text.set_markup)
            this._text.clutter_text.set_markup(text);
        else if(this._text.clutter_text && this._text.clutter_text.set_text)
            this._text.clutter_text.set_text(text);
        else
            getLogger().error("Cannot set indicator string.");
    },

    _loadConfig: function() {
        try {
            // automatically create configuration file when path is invalid
            let entries_file = this._settings.get_string(Prefs.ENTRIES_FILE);
            entries_file = entries_file || GLib.get_home_dir() + "/.entries.json";

            let success = false;
            // retry as most 10 times
            for(let i = 0; i < 10 && ! success; i++) {
                if(!this.entries_file || this.entries_file != entries_file) {
                    let fileobj = Gio.File.new_for_path(entries_file);
                    if(!fileobj.query_exists(null)) {
                        let orgf = Gio.File.new_for_path((Me.path + "/entries.json"));
                        orgf.copy(fileobj, 0, null, null);
                    }

                    let fileinfo = fileobj.query_info("*", Gio.FileQueryInfoFlags.NONE, null);
                    if(fileinfo.get_is_symlink()) {
                        entries_file = fileinfo.get_symlink_target();
                        continue;
                    }

                    getLogger().warning("Reloading " + entries_file);

                    let monitor = fileobj.monitor(Gio.FileMonitorFlags.NONE, null);
                    monitor.connect('changed', Lang.bind(this, this._loadConfig));
                    this.monitor = monitor;
                    this.entries_file = entries_file;

                    success = true;
                }
            }

            getLogger().warning("Reloading " + entries_file);

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
            getLogger().notify("ext",
                "An error occurs when loading entries.",
                errorToString(e));
        }
    },

    _loadSearchBar: function() {
        let is_show_filter = this._settings.get_boolean(Prefs.SHOW_FILTER);
        if(!is_show_filter) {
            if(this.searchBox)
                this.searchBox.destroy();
            this.searchBox = null
            return;
        }

        if(!this.searchBox) {
            this.searchBox = new SearchBox();
            this.menu.box.insert_child_at_index(this.searchBox.actor, 0);
        }
        this.searchBox.setSearch(this.config_loader.entries,
            Lang.bind(this, this._gotSearchResult));
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

        Main.wm.addKeybinding(Prefs.MENU_SHORTCUT, this._settings,
            Meta.KeyBindingFlags.NONE,
            kbmode.NORMAL | kbmode.MESSAGE_TRAY,
            Lang.bind(this, function() {
                this.menu.toggle();
                if(this.searchBox)
                    this.searchBox.search.grab_key_focus();
            }));
    },

    _onOpenStateChanged: function(menu, open) {
        this.parent(menu, open);

        if(open) {
            if(this.searchBox)
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
    Convenience.initTranslations("gnome-extension-quicktoggler");
}

function enable() {
    indicator = new TogglerIndicator();
    Main.panel.addToStatusArea("QuickToggler", indicator);
}

function disable() {
    indicator.destroy();
}

