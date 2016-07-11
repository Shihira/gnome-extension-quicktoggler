# Quick Toggler

Quick Toggler is a GNOME extension providing a handy toggler and command
launcher. All behaviours is controlled by command and their output.

## Installation

Install the plugin by copying the whole folder `quicktoggler@shihira.github.com`
to `~/.local/share/gnome-shell/extensions`.

If you got this extension from source, you have to compile settings schema
first:

```
cd quicktoggler@shihira.github.com/schema/
glib-compile-schemas .
```

And restart GNOME if the extension is not installed. You can now enable it in
`gnome-tweak-tool`.

## Quick Start

Modify `entries.json` as follows and restart the extension.

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
`/examples/README.md`.

![screenshot-1](https://raw.githubusercontent.com/Shihira/gnome-extension-quicktoggler/master/examples/screenshot-1.png)

You can now even apply a fuzzy filter to your entries. In the screenshot below
'h' matches words 'Httpd' and 'Hotspot'.

![screenshot-2](https://raw.githubusercontent.com/Shihira/gnome-extension-quicktoggler/master/examples/screenshot-2.png)

## Configuration

### Tweak Tool

You can customize some items in gnome-tweak-tool. Switch off and then switch on
again the extension after modifying settings.

### entries.json

Currently five types of entries are supported, three of which are basic and two
are derived. For each entry, common properties are:

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

## Footnote

The extension is still buggy and is tested only on Fedora 23 + GNOME 3.18 (but I
believe it runs on 3.16). If you found any bugs, please report to me and paste
relavant log in `journalctl -f /usr/bin/gnome-shell` or your custom log file.

