Quick Toggler is a GNOME extension providing a handy toggler and command
launcher. All behaviours is controlled by command and their output.

## Quick Start

Install the plugin by copy the whole folder `quicktoggler@shihira.github.com`
to `~/.local/share/gnome-shell/extensions` and restart GNOME.

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

Then that's what you will see:

![screenshot-1](https://raw.githubusercontent.com/Shihira/gnome-extension-quicktoggler/master/examples/screenshot-1.png)

## Configuration

Currently five types of entries are supported, three of which are basic and two
are derived. In each entry, `type` and `title` are always required, so they are
not listed below.

1. launcher

Clicking on a launcher entry will simply execute a command. 

| property | default value | comment |
|----------|---------------|---------|
| `command` | `""` | Command to execute on clicked. |

2. toggler

Toggler entry shows a switch. You can customize the behaviour of turn on and
turn off respectively.

| property | default value | comment |
|----------|---------------|---------|
| `command_on` | `""` | Command to execute when turning on the switch. |
| `command_off` | `""` | Command to execute when turning off the switch. |
| `detector` | `""` | Detector command. Leave blank to disable detection. |

> __NOTE: HOW DOES DETECTOR WORK__
> The extension will run the detector periodically (10 seconds or so), and fetch
> data from its stdout pipe. If the output consists of whitespaces or is empty,
> the detection result is `false`. Otherwise it is `true`. The switch will then
> be switch on or off automatically.

3. submenu

As is shown in the screenshot above, it shows a sub-menu.

| property | default value | comment |
|----------|---------------|---------|
| `entries` | REQUIRED | Array of entries in this sub-menu |

4. tmux (derived from toggler)

When you what to run a program as a daemon which is not natively provided, it is
a good idea to run it in a tmux session.

| property | default value | comment |
|----------|---------------|---------|
| `session` | REQUIRED | Tmux session name. |
| `command` | `""` | Command to execute in a tmux session. |

5. systemd (derived from toggler)

Start/stop a systemd unit like httpd, firewalld or something like that. Most
system services provide a systemd way to operate. You will be request for
password by `pkexec`.

| property | default value | comment |
|----------|---------------|---------|
| `unit` | REQUIRED | Systemd unit. |

## Footnote

The extension is still buggy and is tested only on Fedora 23 + GNOME 3.18 (but I
believe it runs on 3.16). If you found any bugs, please report to me and paste
relavant log from `journalctl -f /usr/bin/gnome-shell`.

