# Quick Toggler

Quick Toggler is a GNOME extension providing a handy toggler and command
launcher. All behaviours is controlled by command and their output.

## Installation

The best way would be go to <https://extensions.gnome.org/extension/1077/quick-toggler/> for auto download and installation.

You can also build from source by:

```
cd quicktoggler@shihira.github.com
make install
```

And restart GNOME. If the extension is not running, you can now enable it in
`gnome-tweak-tool`.

## Quick Start

Create or modify `~/.entries.json` as follows and restart the extension.

```
{
    "entries": [
        {
            "type": "launcher",
            "title": "Nautilus",
            "command": "nautilus"
        },
        {
            "type": "toggler",
            "title": "Wifi Hotspot",
            "command_on": "nmcli con up id Hotspot",
            "command_off": "nmcli con down id Hotspot",
            "detector": "nmcli con show --active | grep Hotspot"
        },
        {
            "type": "systemd",
            "title": "Apache Httpd",
            "unit": "httpd"
        },
        {
            "type": "submenu",
            "title": "SubMenu",
            "entries": [
                {
                    "type": "tmux",
                    "title": "Minecraft Server",
                    "session": "cauldron",
                    "command": "cd ~/Cauldron; ./start.sh"
                }
            ]
        }
    ]
}
```

Then what you will see is below. For more examples, view
`/examples/README.md`. We provide a tool `addentry.sh` to add new entries to
`~/.entries.json`, which is based on `jq` and `zenity` so please ensure both
to have been installed before using it.

![screenshot-1](https://raw.githubusercontent.com/Shihira/gnome-extension-quicktoggler/master/examples/screenshot-1.png)

You can now even apply a fuzzy filter to your entries. In the screenshot below
'h' matches words 'Httpd' and 'Hotspot'.

![screenshot-2](https://raw.githubusercontent.com/Shihira/gnome-extension-quicktoggler/master/examples/screenshot-2.png)

## Configuration

### Tweak Tool

You can customize some items in gnome-tweak-tool. Switch off and then switch on
again the extension after modifying settings.

### entries.json

Defaultly, the extension creates and uses `~/.entries.json` that's under your
home path. Also, you can customize this path in the preference window. When the
path you set points to an inexistent file, the extension will create and
initialize it automatically.

It should be easy to understand the quick start example. Above you can see
all "entries" are presented in the list `"entries"`. You can consider each of
these entries as an menu item in the extension's pop-up menu.

Currently five types of entries are supported, three of which are basic and two
are derived (the principle of deriviation will be explained later).
For each entry, common properties are:

- `type` is always required. You should set it to one of the titles below.
- `title` labels the entry. By default, it is `""`

Thus they are not listed below. For derived entries, they share the properties
of their base, so namely you can use `auto_on` and `notify_when` in `systemd`
and `tmux` entries.

#### 1. `launcher`

Clicking on a launcher entry will simply execute a command. 

| property | default value | comment |
|----------|---------------|---------|
| `command` | `""` | Command to execute on clicked. |

#### 2. `toggler`

Toggler entry shows a switch. You can customize the behaviour of turn on and
turn off respectively.

| property | default value | comment |
|----------|---------------|---------|
| `command_on` | `""` | Command to execute when turning on the switch. |
| `command_off` | `""` | Command to execute when turning off the switch. |
| `detector` | `""` | Detector command. Leave blank to disable detection. |
| `auto_on` | false | Try to keep the switch on unless you turn it off manually. |
| `notify_when` | `[]` | When to send a notification. |

In `notify_when` you should fill string "on" or "off", which indicates the
extension will notify you when the toggler becomes on or off _unexpectedly_. Use
`["on", "off"]` for both scenarios. For global behaviours, you can set them
in the preference window.

> __NOTE: HOW DO DETECTORS WORK__
>
> The extension will run the detector periodically (10 seconds or so), and fetch
> data from its stdout pipe. If the output consists of whitespaces or is empty,
> the detection result is `false`. Otherwise it is `true`. The switch will then
> be switch on or off automatically.

#### 3. `submenu`

As is shown in the screenshot above, it shows a sub-menu.

| property | default value | comment |
|----------|---------------|---------|
| `entries` | REQUIRED | Array of entries in this sub-menu |

#### 4. `tmux` (derived from toggler)

When you what to run a program as a daemon which is not natively provided, it is
a good idea to run it in a tmux session.

| property | default value | comment |
|----------|---------------|---------|
| `session` | REQUIRED | Tmux session name. |
| `command` | `""` | Command to execute in a tmux session. |

#### 5. `systemd` (derived from toggler)

Start/stop a systemd unit like httpd, firewalld or something like that. Most
system services provide a systemd way to operate. You will be requested for
password by `pkexec`.

| property | default value | comment |
|----------|---------------|---------|
| `unit` | REQUIRED | Systemd unit. |

#### 6. `separator`

No extra properties. Just a separator.

## Derivation

You can now add your customized entry type through altering the configuration
like this:

```
{
    "deftype": {
        "opendir": {
            "base": "launcher",
            "vars": ["path"],
            "command": "nautilus ${path}"
        },
        "user_systemd": {
            "base": "toggler",
            "vars": ["unit"],
            "command_on": "systemctl start --user ${unit}",
            "command_off": "systemctl stop --user ${unit}",
            "detector": "systemctl status --user ${unit} | grep \\\\bactiv"
        }
    },
    "entries": [
        //...
        {
            "title": "Open Home",
            "type": "opendir",
            "path": "/home/shihira"
        },
        {
            "title": "Open Web",
            "type": "opendir",
            "path": "/var/www"
        },
        {
            "title": "RedShift",
            "type": "user_systemd",
            "unit": "redshift"
        }
        //...
    ]
}
```

When an entry applies an user-defined derived type, the extension replaces
corresponding properties with generic ones defined by user, and passes
properties defined in actual entry instances as environment variables. Take
`"opendir"` type as example. When you click on "Open Web" the menu item,
the command being actually executed is equivalent to:

```
path=/var/www bash -c 'nautilus ${path}'
```

The two derived entries currently provided as built-in type are defined in a
way equivalent to this form (Please refer to `core.js`):

```
"systemd": {
    base: 'toggler',
    vars: ['unit'],
    command_on: "pkexec systemctl start ${unit}",
    command_off: "pkexec systemctl stop ${unit}",
    detector: "systemctl status ${unit} | grep Active:\\\\s\\*activ[ei]",
},
"tmux": {
    base: 'toggler',
    vars: ['command', 'session'],
    command_on: 'tmux new -d -s ${session} bash -c "${command}"',
    command_off: 'tmux kill-session -t ${session}',
    detector: 'tmux ls | grep "${session}"',
}
```

NOTE: Only single-level derivation is supported currently. But to be frank,
higher level derivation is actually completely useless, because you cannot use
environment variables in plain text properties (like title).

## Footnote

The extension is still buggy and is tested only on Fedora 24 + GNOME 3.20 (but I
believe it runs on 3.16 and 3.18). If you found any bugs, please file me reports
and paste relavant log in `journalctl -f /usr/bin/gnome-shell` or your custom
log file.

**Translation is welcome! Currently only English and Chinese are supported. Feel
free to fork and help me in translation.**

