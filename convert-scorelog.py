#!/usr/bin/env python3
import matplotlib.pyplot as plt
import argparse
import json

def parse_scorelog(path):
    tags = {}        # tag_id -> tag_name
    players = {}     # player_id -> name
    turns = []       # list of turn numbers in order
    data_points = {} # (tag_id, player_id) -> {turn: value}

    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split(" ", 3)
            cmd = parts[0]

            if cmd == "id":
                continue
            elif cmd == "tag":
                # tag <tag-id> <descr>
                tag_id = int(parts[1])
                tag_name = parts[2]
                tags[tag_id] = tag_name
            elif cmd == "turn":
                # turn <turn> <number> <descr>
                turn_num = int(parts[1])
                turns.append(turn_num)
            elif cmd == "addplayer":
                # addplayer <turn> <player-id> <name>
                player_id = int(parts[2])
                player_name = parts[3] if len(parts) > 3 else ""
                players[player_id] = player_name
            elif cmd == "delplayer":
                # delplayer <turn> <player-id>
                continue
            elif cmd == "data":
                # data <turn> <tag-id> <player-id> <value>
                turn = int(parts[1])
                tag_id = int(parts[2])
                player_id = int(parts[3].split(" ", 1)[0])
                value = float(parts[3].split(" ", 1)[1]) if " " in parts[3] else 0.0
                key = (tag_id, player_id)
                if key not in data_points:
                    data_points[key] = {}
                data_points[key][turn] = value

    return tags, players, turns, data_points

def build_apex_json(tags, players, turns, data_points):
    series_by_tag = {}
    for tag_id, tag_name in sorted(tags.items()):
        series_list = []
        for player_id, player_name in sorted(players.items()):
            key = (tag_id, player_id)
            points = data_points.get(key, {})
            if not points:
                continue

            data = [{"x": t, "y": points[t]} for t in turns if t in points]
            series_list.append({
                "name": f"{player_id} {player_name}".strip(),
                "data": data
            })

        series_by_tag[str(tag_id)] = {
            "tag": tag_name,
            "series": series_list
        }

    return {
        "xAxis": "turn",
        "seriesByTag": series_by_tag
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Path to scorelog file")
    parser.add_argument("-o", "--output", default="scorelog.json")
    args = parser.parse_args()

    tags, players, turns, data_points = parse_scorelog(args.input)
    output = build_apex_json(tags, players, turns, data_points)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=True)

if __name__ == "__main__":
    main()
