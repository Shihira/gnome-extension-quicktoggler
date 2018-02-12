# Examples

Here are some examples. Put them inside `"entries": [...]` to make them work.
Welcome for more third-party examples. File me pull requests if you want to add
yours.

NOTE: With `addentry.sh`, simply paste any of the following code snippet as a **custom** entry.

## Restart the Extension

Simply disable and re-enable. Useful when your entries are modified.

```
{
    "type": "launcher",
    "title": "Restart Extension",
    "command": "gnome-shell-extension-tool -d quicktoggler@shihira.github.com && gnome-shell-extension-tool -e quicktoggler@shihira.github.com"
}
```

## Open Preference Window

```
{
    "type": "launcher",
    "title": "Edit Preference",
    "command": "gnome-shell-extension-prefs quicktoggler@shihira.github.com"
}
```

## Edit Entries

Replace the path to your entries.json location.

```
{
    "type": "launcher",
    "title": "Edit Entries",
    "command": "gnome-open ~/.entries.json"
}
```

## Enable Wifi Hotspot

Make sure your Hotspot id is `Hotspot` :)

```
{
    "type": "toggler",
    "title": "Wifi Hotspot",
    "command_on": "nmcli con up id Hotspot",
    "command_off": "nmcli con down id Hotspot",
    "detector": "nmcli con show --active | grep Hotspot"
}
```

## Run Privileged Command

Don't forget `env DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY` to run GUI apps.

```
{
    "type": "launcher",
    "title": "Firewall",
    "command": "pkexec env DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY firewall-config"
}
```

## Toggle Input Method

Considerable tasks can be done by gsettings.

```
{
    "type": "toggler",
    "title": "Japanese Input",
    "detector": "gsettings get org.gnome.desktop.input-sources sources | grep kkc",
    "command_on": "gsettings set org.gnome.desktop.input-sources sources \"[('xkb', 'us'),('ibus', 'kkc')]\"",
    "command_off": "gsettings set org.gnome.desktop.input-sources sources \"[('xkb', 'us')]\""
}
```

## Ban Suspension on AC

```
{
    "type": "toggler",
    "title": "No Suspend on AC",
    "detector": "gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type | grep nothing",
    "command_on": "gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type nothing",
    "command_off": "gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type suspend"
}
```

## Keep Eye on CPU Temperature

You can print information you care about on the top-bar, especially real-time information, like CPU temperature, stock prices, etc.

```
{
    "type": "tmux",
    "title": "CPU Temperature",
    "session": "cpu-temp",
    "command": "while true; do gsettings --schemadir ~/.local/share/gnome-shell/extensions/quicktoggler@shihira.github.com/schemas set org.gnome.shell.extensions.quicktoggler indicator-text \"$(expr $(cat /sys/class/thermal/thermal_zone0/temp) / 1000) deg\"; sleep 2; done"
}
```
