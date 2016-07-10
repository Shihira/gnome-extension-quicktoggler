const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ENTRIES_FILE = "entries-file";
const DETECTION_INTERVAL = "detection-interval";
const LOG_FILE = "log-file";
const INDICATOR_ICON = "indicator-icon";
const MENU_SHORTCUT = "menu-shortcut";

const PrefsWindow = new Lang.Class({
    Name: "PrefsWindow",

    _init: function(prop) {
        this._builder = new Gtk.Builder();
        this._builder.add_from_file(Me.path + "/prefs.glade");
        this.loadNames([
            "layout-prefs",
            "check-entries",
            "file-entries",
            "entry-indicator",
            "entry-shortcut",
            "spin-interval",
            "switch-log",
            "radio-log-gnome",
            "radio-log-file",
            "file-log-file",
            "switch-notify",
            "check-notify-proc",
            "check-notify-ext",
            "check-notify-state",
            "btn-apply",
            "btn-restore",
        ]);

        this.bindState(this.switch_log, [
            this.radio_log_gnome,
            this.radio_log_file,
            this.file_log_file,
        ], "state-set");

        this.bindState(this.radio_log_file,
            [this.file_log_file],
            "toggled");

        this.bindState(this.check_entries,
            [this.file_entries],
            "toggled");

        this.bindState(this.switch_notify, [
            this.check_notify_proc,
            this.check_notify_ext,
            this.check_notify_state,
        ], "state_set");

        this.bindSchema(ENTRIES_FILE, "string");
        this.bindSchema(INDICATOR_ICON, "string");
        this.bindSchema(MENU_SHORTCUT, "strv");
        this.bindSchema(DETECTION_INTERVAL, "int");
        this.bindSchema(LOG_FILE, "string");

        this.setupSettings();
        this.setupState();

        this.btn_apply.connect("clicked",
            Lang.bind(this, this.storeSettings));
        this.btn_restore.connect("clicked",
            Lang.bind(this, this.setupSettings));
    },

    ////////////////////////////////////////////////////////////////////////////
    // GUI Part

    loadNames: function(names) {
        for(let i in names) {
            let regname = names[i].replace(/-/g, '_');
            this[regname] = this._builder.get_object(names[i]);
        }
    },

    bindState: function(sw, widgets, sig) {
        if(!this.state_link)
            this.state_link = []

        function state_handler(_) {
            for(let i in widgets)
                widgets[i].sensitive = sw.active;
        }

        this.state_link.push([sw, state_handler])

        sw.connect(sig, state_handler);
    },

    setupState: function() {
        for(let i in this.state_link) {
            this.state_link[i][1]();
        }
    },

    ////////////////////////////////////////////////////////////////////////////
    // Data Exchange Part

    bindSchema: function(schema_name, type, prop) {
        prop = prop || schema_name.replace(/-/, '_');
        if(!this.schema_prop_map)
            this.schema_prop_map = {};
        this.schema_prop_map[schema_name] = [type, prop];
    },

    setupSettings: function() {
        for(let sch in this.schema_prop_map) {
            let prop = this.schema_prop_map[sch];
            let value = Convenience.getSettings()["get_" + prop[0]](sch);
            this[prop[1]] = value;
        }
    },

    storeSettings: function() {
        for(let sch in this.schema_prop_map) {
            let prop = this.schema_prop_map[sch];
            let value = this[prop[1]];
            Convenience.getSettings()["set_" + prop[0]](sch, value);
        }
    },

    get entries_file() {
        return this.check_entries.active ?
            this.file_entries.get_filename() : "";
    },
    set entries_file(f) {
        this.check_entries.active = Boolean(f);
        if(f) this.file_entries.set_filename(f);
    },
    get indicator_icon() { return this.entry_indicator.get_text(); },
    set indicator_icon(t) { this.entry_indicator.set_text(t); },
    get menu_shortcut() { return [this.entry_shortcut.get_text()]; },
    set menu_shortcut(v) { return this.entry_shortcut.set_text(v[0]); },
    get detection_interval() { return this.spin_interval.value; },
    set detection_interval(i) { this.spin_interval.value = i; },
    get log_file() {
        return !this.switch_log.active ? "" :
            this.radio_log_gnome.active ? "gnome-shell" :
            this.file_log_file.get_filename();
    },
    set log_file(t) {
        this.switch_log.active = (t != "");
        if(t == "gnome-shell")
            this.radio_log_gnome.active = true;
        else
            this.file_log_file.set_filename(t);
    },
});

function init() {
}

function buildPrefsWidget() {
    let w = new PrefsWindow();
    w.layout_prefs.show_all();

    return w.layout_prefs;
}

