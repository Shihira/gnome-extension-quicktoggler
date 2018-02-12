#!/bin/bash

entries_json="$1"
[[ "$1" = "" ]] && entries_json=$HOME/.entries.json
[[ -x $(which jq) ]] || zenity --error --text "Please install jq"

entries_content=$(cat "$entries_json")
cp "$entries_json" "${entries_json}.old"

type=$(zenity --title "Add New Entry" \
    --forms --text="Entry Properties" \
    --add-combo="Type" --combo-values="launcher|custom|systemd|tmux") || exit

if [[ "$type" = "launcher" ]]; then
    prop=$(zenity --title "Add New Launcher Entry" \
        --forms --text="Entry Properties" \
        --add-entry "Title" --add-entry "Command") || exit
    title=$(echo "$prop" | cut -d'|' -f 1)
    command=$(echo "$prop" | cut -d'|' -f 2-)

    echo "Adding $title"

    echo "$entries_content" | \
        jq '.entries += [{ "type": "launcher", "title": $title, "command": $command }]' \
            --arg title "$title" \
            --arg command "$command" > "$entries_json"
elif [[ "$type" = "custom" ]]; then
    json=$(zenity --title "Add New Custom Entry" \
        --forms --text="Entry Properties" \
        --add-entry "JSON Entry") || exit
    echo "$entries_content" | \
        jq '.entries += [$json]' \
            --argjson json "$json" > "$entries_json"
elif [[ "$type" = "systemd" ]]; then
    echo "Finding services..."
    services=$(systemctl list-unit-files | grep '.*\.service' | cut -d' ' -f 1 | paste -sd '|')
    echo "$services"

    prop=$(zenity --title "Add New Systemd Entry" \
        --forms --text="Entry Properties" \
        --add-entry "Title" \
        --add-list="Services" --list-values="$services") || exit
    title=$(echo "$prop" | cut -d'|' -f 1)
    unit=$(echo "$prop" | cut -d'|' -f 2-)

    echo "Adding $title: $unit"

    echo "$entries_content" | \
        jq '.entries += [{ "type": "systemd", "title": $title, "unit": $unit }]' \
            --arg title "$title" \
            --arg unit "$unit" > "$entries_json"
elif [[ "$type" = "tmux" ]]; then
    prop=$(zenity --title "Add New Launcher Entry" \
        --forms --text="Entry Properties" \
        --add-entry "Title" --add-entry "Session Name" --add-entry "Command") || exit
    title=$(echo "$prop" | cut -d'|' -f 1)
    session=$(echo "$prop" | cut -d'|' -f 2)
    command=$(echo "$prop" | cut -d'|' -f 3-)

    echo "Adding $title: $session"

    echo "$entries_content" | \
        jq '.entries += [{ "type": "tmux", "title": $title, "session": $session, "command": $command }]' \
            --arg title "$title" \
            --arg session "$session" \
            --arg command "$command" > "$entries_json"
fi

if [[ $? = 0 ]]; then
    zenity --info --text "Configuration has been successfully updated. Old file has renamed to ${entries_json}.old"
else
    zenity --error --text "Failed to update configuration. Old file has renamed to ${entries_json}.old"
fi
