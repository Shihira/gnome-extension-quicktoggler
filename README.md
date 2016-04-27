Quick Toggler is a GNOME extension providing a handy toggler for generic
purpose.

## Quick Start

Modify entries.json as follows, and restart the extension:

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
        }
    ]
}
```

