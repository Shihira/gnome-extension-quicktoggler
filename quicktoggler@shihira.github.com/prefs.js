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

const PrefsItemBase = new Lang.Class({
    Name: "PrefsItemBase",
    Extends: Gtk.Box,

    _init: function(prop) {
        this.parent({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 10,
            margin_left: 10,
            margin_right: 10,
        });

        for(let k in prop)
            this[k] = prop[k];

        this._label = new Gtk.Label({ label: this.label, xalign: 0 });

        this.pack_start(this._label, true, true, 0);
    },
});

const PrefsItemString = new Lang.Class({
    Name: "PrefsItemString",
    Extends: PrefsItemBase,

    _init: function(prop) {
        this.parent(prop);

        this.value = Convenience.getSettings().get_string(this.schema_id);

        this._input = new Gtk.Entry({
            text: this.value,
            placeholder_text: this.placeholder || "",
        });
        this._input.connect("notify::text", Lang.bind(this, this._onChanged));

        this.add(this._input);
    },

    _onChanged: function() {
        this.value = this._input.get_text();
        Convenience.getSettings().set_string(this.schema_id, this.value);
    }
});

const PrefsItemShortcut = new Lang.Class({
    Name: "PrefsItemShortcut",
    Extends: PrefsItemBase,

    _init: function(prop) {
        this.parent(prop);

        this.value = Convenience.getSettings().get_strv(this.schema_id)[0];

        this._input = new Gtk.Entry({
            text: this.value,
            placeholder_text: this.placeholder || "",
        });
        this._input.connect("notify::text", Lang.bind(this, this._onChanged));

        this.add(this._input);
    },

    _onChanged: function() {
        this.value = this._input.get_text();
        Convenience.getSettings().set_strv(this.schema_id, [this.value]);
    }
});

const PrefsItemInteger = new Lang.Class({
    Name: "PrefsItemInteger",
    Extends: PrefsItemBase,

    _init: function(prop) {
        this.parent(prop);

        this.value = Convenience.getSettings().get_int(this.schema_id);
        this.step = this.step || 1;

        let adjustment = new Gtk.Adjustment({
            lower: this.min,
            upper: this.max,
            step_increment: this.step,
        });

        this._input = new Gtk.SpinButton({
            adjustment: adjustment,
            snap_to_ticks: true,
        });
        this._input.set_value(this.value);
        this._input.connect('value-changed', Lang.bind(this, this._onChanged));

        this.add(this._input);
    },

    _onChanged: function() {
        this.value = this._input.get_value();
        Convenience.getSettings().set_int(this.schema_id, this.value);
    }
});

const PrefsWidget = new Lang.Class({
    Name: "PrefsWidget",
    Extends: Gtk.Box,

    _init: function(prop) {
        this.parent({
            orientation: Gtk.Orientation.VERTICAL,
        });

        this.add(new PrefsItemString({
            label: "Entries File", 
            schema_id: ENTRIES_FILE,
            placeholder: "default",
        }));
        this.add(new PrefsItemString({
            label: "Log File", 
            schema_id: LOG_FILE,
            placeholder: "disabled",
        }));
        this.add(new PrefsItemString({
            label: "Indicator Icon", 
            schema_id: INDICATOR_ICON,
        }));
        this.add(new PrefsItemShortcut({
            label: "Toggle Shortcut", 
            schema_id: MENU_SHORTCUT,
        }));
        this.add(new PrefsItemInteger({
            label: "Detection Interval (ms)", 
            schema_id: DETECTION_INTERVAL,
            min: 1000, max: 3600000, step: 500,
        }));
    },
});

function init() {
}

function buildPrefsWidget() {
    let widget = new PrefsWidget();
    widget.show_all();

    return widget;
}

