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

const ENTRIES_FILE = "entries-file";
const DETECTION_INTERVAL = "detection-interval";
const LOG_FILE = "log-file";
const INDICATOR_ICON = "indicator-icon";

let logger = null;

const Logger = new Lang.Class({
    Name: 'Logger',

    _init: function(log_file) {
        // initailize log_backend
        if(!log_file) {
            this.log = function(_) { };
        } else if(log_file == "gnome-shell") {
            this.log = function(s) {
                global.log("[QuickToggler] " + s);
            }
        } else {
            // Open the file, or use GNOME logger if failed.
            this._output_file = Gio.File.new_for_path(log_file);
            this._fstream = _output_file.open_readwrite(null).output_stream;

            if(!this._fstream instanceof Gio.FileIOStream) {
                this.log = function(s) {
                    global.log("[QuickToggler] " + s);
                }
                this.log("Open log file '" + log_file + "' failed(" +
                        this._fstream + ")");
                return;
            }

            this.log = function(s) {
                this._fstream.write(String(new Date())+" "+s, null);
            }
        }
    },
});

function getLogger() {
    return logger;
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
        let log_file = this._settings.get_string(LOG_FILE);

        logger = new Logger(log_file);
    },

    _loadIcon: function() {
        let icon_name = this._settings.get_string(INDICATOR_ICON);

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
        let entries_file = this._settings.get_string(ENTRIES_FILE);
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
    },

    _loadPulser: function() {
        let interval = this._settings.get_int(DETECTION_INTERVAL);

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
        for(let i in this.config_loader.entries) {
            let conf = this.config_loader.entries[i];
            conf.pulse();
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
