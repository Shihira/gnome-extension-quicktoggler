/*
 * Developer: Shihira Fung <fengzhiping@hotmail.com>
 * Date: Apr 27, 2016
 * License: GPLv2
 */

const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const St = imports.gi.St;
const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Core = Me.imports.core;

const TogglerIndicator = new Lang.Class({
    Name: 'TogglerIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(St.Align.START);

        let icon = new St.Icon({
                icon_name: 'emblem-system-symbolic',
                style_class: 'system-status-icon'
        });

        this.actor.add_actor(icon);
        this.config_loader = new Core.ConfigLoader();
        this.config_loader.loadConfig(Me.path + "/entries.json");

        for(i in this.config_loader.config) {
            let item = this.config_loader.config[i].item;
            this.menu.addMenuItem(item);
        }

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000,
            Lang.bind(this, function() {
                for(i in this.config_loader.config) {
                    let conf = this.config_loader.config[i];
                    conf.pulse();
                }
                return true;
            }));

    },
});

////////////////////////////////////////////////////////////////////////////////
// Entries

let indicator;

function init() { }

function enable() {
    indicator = new TogglerIndicator();
    Main.panel.addToStatusArea("QuickToggler", indicator);
}

function disable() {
    Main.panel._rightBox.remove_actor(indicator.actor);
}
