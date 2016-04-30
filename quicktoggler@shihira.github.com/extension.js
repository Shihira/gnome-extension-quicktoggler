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
const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Core = Me.imports.core;
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

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

        this.info = this.log;
        this.warning = this.log;
        this.error = this.log;
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

// a global instance of Logger, created when initing indicator
const TogglerIndicator = new Lang.Class({
    Name: 'TogglerIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(St.Align.START);

        this._loadSettings();
    },

    _loadSettings: function() {
        this._settings = new Convenience.getSettings();

        this._loadLogger();
        this._loadIcon();
        this._loadConfig();
        this._loadPulser();
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

            if(!this._config_loader) {
                this.config_loader = new Core.ConfigLoader();
                this.config_loader.loadConfig(entries_file);
            } else {
                this.config_loader.loadConfig(entries_file);
            }

            this.menu.removeAll();
            for(let i in this.config_loader.entries) {
                let item = this.config_loader.entries[i].item;
                this.menu.addMenuItem(item);
            }
        } catch(e) {
            getLogger().error("Error while loading entries:");
            getLogger().error(errorToString(e));
            Main.notify("An error occurs when loading entries.");
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
    indicator.emit('destroy');
}

