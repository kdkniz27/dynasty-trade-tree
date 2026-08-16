"""
Static data generator for the Dynasty Trade Tree site.

WHAT THIS SCRIPT DOES
----------------------
This replaces the old Flask server. Instead of a live backend that
fetches from Sleeper and builds a tree on every request, this script
does ALL the work once (fetch, build, resolve names) and writes a
single static JSON file that the frontend can fetch and render with
zero server-side logic.

Run it locally:
    pip install -r requirements.txt
    python generate_data.py

Or let GitHub Actions run it on a schedule (see
.github/workflows/refresh-data.yml) so the site's data stays current
without you doing anything.

OUTPUT
------
web/public/data/trades.json - a lightweight index for the sidebar:
{
  "generated_at": "2026-08-16T12:00:00Z",
  "league_id": "1312658766117744640",
  "trades": [ {trade_id, date, season, summary, teams}, ... ]
}

web/public/data/trees/<trade_id>.json - one file per trade, the full
name-resolved tree for that trade, fetched lazily by the frontend only
when that trade is selected:
{ "trade_id": ..., "date": ..., "assets": [ ...fully resolved... ] }

Each trade gets its own file (instead of one giant combined file)
for two reasons: GitHub rejects any single pushed file over 100 MB,
and a dynasty league's trade trees overlap heavily, so one combined
file balloons fast. Per-trade files also mean the site only downloads
the one tree you're actually looking at.

Every name (players, teams, picks) is already resolved to plain
strings in these files - the frontend never needs players.json or any
Sleeper call at runtime.
"""

import json
import os
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CURRENT_LEAGUE_ID = os.environ.get("SLEEPER_LEAGUE_ID") or "1312658766117744640"

DATA_DIR = os.environ.get(
    "DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "web", "public", "data"),
)
INDEX_PATH = os.path.join(DATA_DIR, "trades.json")
TREES_DIR = os.path.join(DATA_DIR, "trees")


# ---------------------------------------------------------------------------
# Low-level fetch helper
# ---------------------------------------------------------------------------

def get_data(url):
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Players - fetched fresh from Sleeper instead of relying on a local file,
# so rookie names etc. are always current when this runs on a schedule.
# ---------------------------------------------------------------------------

def fetch_players():
    print("Fetching players.json from Sleeper (this is a big download)...")
    return get_data("https://api.sleeper.app/v1/players/nfl")


# ---------------------------------------------------------------------------
# Step 1: Walk the dynasty league's history
# ---------------------------------------------------------------------------

def get_league_history(current_league_id):
    """Return a list of every league_id in this dynasty's history,
    newest first, by following previous_league_id back in time."""

    league_ids = []
    league_id = current_league_id

    while league_id:
        league = get_data(f"https://api.sleeper.app/v1/league/{league_id}")
        league_ids.append(league_id)
        league_id = league.get("previous_league_id")

    return league_ids


# ---------------------------------------------------------------------------
# Step 2: Pull per-season league metadata (rosters, users, team names)
# ---------------------------------------------------------------------------

def fetch_league_metadata(league_ids):
    """For every season, fetch league/roster/user info and build a
    season-by-season roster_id -> team name map.

    Returns (league_data, team_names) where:
      league_data[league_id]        = raw league info (has "season")
      team_names[league_id][roster_id_str] = display name for that team
                                              THAT SEASON
    """

    league_data = {}
    team_names = {}

    for league_id in league_ids:
        league_data[league_id] = get_data(
            f"https://api.sleeper.app/v1/league/{league_id}"
        )

        rosters = get_data(
            f"https://api.sleeper.app/v1/league/{league_id}/rosters"
        )
        users = get_data(
            f"https://api.sleeper.app/v1/league/{league_id}/users"
        )
        users_by_id = {u["user_id"]: u for u in users}

        team_names[league_id] = {}
        for roster in rosters:
            roster_id = str(roster["roster_id"])
            owner_id = roster["owner_id"]
            user = users_by_id.get(owner_id)

            if user:
                name = user.get("metadata", {}).get("team_name") or user.get(
                    "display_name"
                )
                avatar = user.get("avatar")
            else:
                name = None
                avatar = None

            team_names[league_id][roster_id] = {
                "name": name or f"Roster {roster_id}",
                "avatar": (
                    f"https://sleepercdn.com/avatars/thumbs/{avatar}"
                    if avatar
                    else None
                ),
            }

    return league_data, team_names


# ---------------------------------------------------------------------------
# Step 3: Trades, across every season
# ---------------------------------------------------------------------------

def fetch_all_trades(league_ids, league_data, max_week=18):
    """Pull every trade transaction from every season in league_ids."""

    all_trades = []

    for league_id in league_ids:
        season = league_data[league_id]["season"]

        for week in range(1, max_week + 1):
            try:
                transactions = get_data(
                    f"https://api.sleeper.app/v1/league/{league_id}"
                    f"/transactions/{week}"
                )
            except requests.exceptions.RequestException:
                continue

            for transaction in transactions:
                if transaction["type"] == "trade":
                    transaction["league_id"] = league_id
                    transaction["season"] = season
                    all_trades.append(transaction)

    return all_trades


# ---------------------------------------------------------------------------
# Step 4: Drafts, across every season, + a pick -> player lookup
# ---------------------------------------------------------------------------

def fetch_draft_selections(league_ids, league_data):
    draft_pick_selections = {}

    for league_id in league_ids:
        league_season = league_data[league_id]["season"]

        draft_summaries = get_data(
            f"https://api.sleeper.app/v1/league/{league_id}/drafts"
        )

        for summary in draft_summaries:
            draft_id = summary["draft_id"]

            draft = get_data(f"https://api.sleeper.app/v1/draft/{draft_id}")

            slot_to_roster_id = draft.get("slot_to_roster_id") or {}
            draft_season = draft.get("season") or summary.get(
                "season"
            ) or league_season

            picks = get_data(f"https://api.sleeper.app/v1/draft/{draft_id}/picks")

            if not slot_to_roster_id:
                slot_to_roster_id = _infer_slot_to_roster(picks)
                if slot_to_roster_id:
                    print(
                        f"    note: draft {draft_id} ({draft_season}) had no "
                        f"slot_to_roster_id; inferred it from pick data"
                    )

            for pick in picks:
                player_id = pick.get("player_id")
                round_num = pick.get("round")
                draft_slot = pick.get("draft_slot")

                if not player_id or not round_num or draft_slot is None:
                    continue

                original_roster = slot_to_roster_id.get(str(draft_slot))
                if original_roster is None:
                    continue

                key = (str(draft_season), round_num, int(original_roster))
                draft_pick_selections[key] = {
                    "player_id": player_id,
                    "pick_no": pick.get("pick_no"),
                }

    return draft_pick_selections


def _infer_slot_to_roster(picks):
    slot_counts = {}

    for pick in picks:
        draft_slot = pick.get("draft_slot")
        roster_id = pick.get("roster_id")
        if draft_slot is None or roster_id is None:
            continue

        slot_key = str(draft_slot)
        slot_counts.setdefault(slot_key, {})
        slot_counts[slot_key][int(roster_id)] = (
            slot_counts[slot_key].get(int(roster_id), 0) + 1
        )

    return {
        slot: max(counts.items(), key=lambda kv: kv[1])[0]
        for slot, counts in slot_counts.items()
        if counts
    }


# ---------------------------------------------------------------------------
# Step 5: Build the trade ledger (one row per asset per trade)
# ---------------------------------------------------------------------------

def build_trade_ledger(all_trades):
    trade_ledger = []

    for trade in all_trades:
        trade_date = datetime.fromtimestamp(
            trade["created"] / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")

        adds = trade.get("adds") or {}
        drops = trade.get("drops") or {}

        for player_id, to_roster in adds.items():
            trade_ledger.append(
                {
                    "type": "player",
                    "player_id": player_id,
                    "from_roster": drops.get(player_id),
                    "to_roster": to_roster,
                    "trade_id": trade["transaction_id"],
                    "league_id": trade["league_id"],
                    "season": trade["season"],
                    "trade_date": trade_date,
                    "trade_timestamp": trade["created"],
                }
            )

        for pick in trade.get("draft_picks") or []:
            asset_id = (
                f"{pick['season']}_R{pick['round']}"
                f"_ORIGINAL_{pick['roster_id']}"
            )

            trade_ledger.append(
                {
                    "type": "draft_pick",
                    "asset_id": asset_id,
                    "season": pick["season"],
                    "round": pick["round"],
                    "original_roster": pick["roster_id"],
                    "from_roster": pick["previous_owner_id"],
                    "to_roster": pick["owner_id"],
                    "trade_id": trade["transaction_id"],
                    "league_id": trade["league_id"],
                    "trade_date": trade_date,
                    "trade_timestamp": trade["created"],
                }
            )

    return trade_ledger


def build_asset_history(trade_ledger):
    asset_history = {}

    for row in trade_ledger:
        if row["type"] == "player":
            asset_id = f"player_{row['player_id']}"
        else:
            asset_id = row["asset_id"]

        asset_history.setdefault(asset_id, []).append(row)

    for asset_id in asset_history:
        asset_history[asset_id].sort(key=lambda event: event["trade_timestamp"])

    return asset_history


# ---------------------------------------------------------------------------
# Step 6: Tree building - starting from a trade
# ---------------------------------------------------------------------------

def get_trade_assets(trade):
    assets = []
    adds = trade.get("adds") or {}
    drops = trade.get("drops") or {}

    for player_id, to_roster in adds.items():
        assets.append(
            {
                "asset_id": f"player_{player_id}",
                "type": "player",
                "from_roster": drops.get(player_id),
                "to_roster": to_roster,
            }
        )

    for pick in trade.get("draft_picks") or []:
        asset_id = (
            f"{pick['season']}_R{pick['round']}_ORIGINAL_{pick['roster_id']}"
        )
        assets.append(
            {
                "asset_id": asset_id,
                "type": "draft_pick",
                "season": pick["season"],
                "round": pick["round"],
                "from_roster": pick["previous_owner_id"],
                "to_roster": pick["owner_id"],
            }
        )

    return assets


def _pick_final_owner(asset_id, asset_history):
    _, _, _, original_roster = asset_id.split("_", 3)
    owner = int(original_roster)

    for event in asset_history.get(asset_id, []):
        owner = event["to_roster"]

    return owner


def build_asset_tree(
    asset_id,
    all_trades,
    asset_history,
    draft_pick_selections,
    after_timestamp=None,
    visited=None,
):
    if visited is None:
        visited = set()

    tree = {"asset_id": asset_id, "trades": [], "drafted_as": None}

    trades_by_id = {t["transaction_id"]: t for t in all_trades}

    for event in asset_history.get(asset_id, []):
        if after_timestamp and event["trade_timestamp"] <= after_timestamp:
            continue

        path_key = (asset_id, event["trade_id"])
        if path_key in visited:
            continue
        visited.add(path_key)

        trade = trades_by_id.get(event["trade_id"])
        if not trade:
            continue

        trade_node = {
            "trade_id": event["trade_id"],
            "date": event["trade_date"],
            "league_id": event["league_id"],
            "moved_from": event.get("from_roster"),
            "moved_to": event.get("to_roster"),
            "assets": [],
        }

        for asset in get_trade_assets(trade):
            if asset["asset_id"] == asset_id:
                trade_node["assets"].append(
                    {
                        "asset_id": asset["asset_id"],
                        "type": asset["type"],
                        "from_roster": asset.get("from_roster"),
                        "to_roster": asset.get("to_roster"),
                        "is_traced": True,
                        "trades": [],
                        "drafted_as": None,
                    }
                )
                continue

            child_tree = build_asset_tree(
                asset["asset_id"],
                all_trades,
                asset_history,
                draft_pick_selections,
                after_timestamp=event["trade_timestamp"],
                visited=visited,
            )

            trade_node["assets"].append(
                {
                    "asset_id": asset["asset_id"],
                    "type": asset["type"],
                    "from_roster": asset.get("from_roster"),
                    "to_roster": asset.get("to_roster"),
                    "trades": child_tree["trades"],
                    "drafted_as": child_tree["drafted_as"],
                }
            )

        tree["trades"].append(trade_node)

    if asset_id.count("_") >= 3 and not asset_id.startswith("player_"):
        season, round_part, _, original_roster = asset_id.split("_", 3)
        round_num = int(round_part[1:])
        original_roster = int(original_roster)

        selection = draft_pick_selections.get(
            (season, round_num, original_roster)
        )

        if selection:
            player_id = selection["player_id"]
            owner = _pick_final_owner(asset_id, asset_history)
            player_asset_id = f"player_{player_id}"
            drafted_tree = build_asset_tree(
                player_asset_id,
                all_trades,
                asset_history,
                draft_pick_selections,
                after_timestamp=None,
                visited=visited,
            )
            tree["drafted_as"] = {
                "player_id": player_id,
                "drafted_by_roster": owner,
                "season": season,
                "round": round_num,
                "pick_no": selection.get("pick_no"),
                "trades": drafted_tree["trades"],
            }

    return tree


def build_trade_tree(trade_id, all_trades, asset_history, draft_pick_selections):
    trade = next(
        (t for t in all_trades if t["transaction_id"] == trade_id), None
    )
    if not trade:
        return None

    trade_date = datetime.fromtimestamp(
        trade["created"] / 1000, tz=timezone.utc
    ).strftime("%Y-%m-%d")

    tree = {
        "trade_id": trade_id,
        "date": trade_date,
        "league_id": trade["league_id"],
        "assets": [],
    }

    for asset in get_trade_assets(trade):
        asset_tree = build_asset_tree(
            asset["asset_id"],
            all_trades,
            asset_history,
            draft_pick_selections,
            after_timestamp=trade["created"],
        )

        tree["assets"].append(
            {
                "asset_id": asset["asset_id"],
                "type": asset["type"],
                "from_roster": asset.get("from_roster"),
                "to_roster": asset.get("to_roster"),
                "trades": asset_tree["trades"],
                "drafted_as": asset_tree["drafted_as"],
            }
        )

    return tree


# ---------------------------------------------------------------------------
# Name resolution - baked into the output JSON so the frontend never has
# to look anything up itself.
# ---------------------------------------------------------------------------

def build_season_to_league_id(league_data):
    return {info["season"]: league_id for league_id, info in league_data.items()}


def resolve_asset_name(asset_id, players, team_names=None, season_to_league_id=None):
    if asset_id.startswith("player_"):
        player_id = asset_id.replace("player_", "")
        return players.get(str(player_id), {}).get(
            "full_name", f"Unknown Player ({player_id})"
        )

    season, round_part, _, original_roster = asset_id.split("_", 3)
    label = f"{season} Round {round_part[1:]}"

    if team_names is not None and season_to_league_id is not None:
        origin_league_id = season_to_league_id.get(season)

        if not origin_league_id and season_to_league_id:
            latest_season = max(season_to_league_id.keys(), key=lambda s: int(s))
            origin_league_id = season_to_league_id[latest_season]

        if origin_league_id:
            team = resolve_team(origin_league_id, original_roster, team_names)
            label += f" ({team['name']})"

    return label


def resolve_team(league_id, roster_id, team_names):
    if roster_id is None:
        return {"name": "Unknown", "avatar": None}
    return team_names.get(league_id, {}).get(
        str(roster_id), {"name": f"Roster {roster_id}", "avatar": None}
    )


def player_meta(player_id, players):
    p = players.get(str(player_id), {})
    return {
        "full_name": p.get("full_name", f"Unknown Player ({player_id})"),
        "position": p.get("position"),
        "team": p.get("team"),
    }


def resolve_trade_list_for_display(trades, players, team_names, season_to_league_id):
    out = []
    for trade in trades:
        dest = resolve_team(trade["league_id"], trade.get("moved_to"), team_names)
        out.append(
            {
                "trade_id": trade["trade_id"],
                "date": trade["date"],
                "moved_to": dest,
                "assets": [
                    resolve_asset_for_display(
                        asset, players, team_names, season_to_league_id, trade["league_id"]
                    )
                    for asset in trade["assets"]
                ],
            }
        )
    return out


def resolve_asset_for_display(asset, players, team_names, season_to_league_id, league_id):
    name = resolve_asset_name(asset["asset_id"], players, team_names, season_to_league_id)
    to_team = resolve_team(league_id, asset.get("to_roster"), team_names)
    from_roster = asset.get("from_roster")
    from_team = (
        resolve_team(league_id, from_roster, team_names)
        if from_roster is not None
        else None
    )

    out = {
        "asset_id": asset["asset_id"],
        "type": asset["type"],
        "name": name,
        "player": (
            player_meta(asset["asset_id"].replace("player_", ""), players)
            if asset["type"] == "player"
            else None
        ),
        "to_team": to_team,
        "from_team": from_team,
        "is_traced": asset.get("is_traced", False),
        "trades": resolve_trade_list_for_display(
            asset.get("trades", []), players, team_names, season_to_league_id
        ),
        "drafted_as": None,
    }

    drafted = asset.get("drafted_as")
    if drafted:
        drafted_league_id = season_to_league_id.get(drafted["season"])
        drafted_name = resolve_asset_name(f"player_{drafted['player_id']}", players)
        drafted_by = resolve_team(
            drafted_league_id, drafted.get("drafted_by_roster"), team_names
        )
        out["drafted_as"] = {
            "player_name": drafted_name,
            "player": player_meta(drafted["player_id"], players),
            "drafted_by": drafted_by,
            "round": drafted.get("round"),
            "pick_no": drafted.get("pick_no"),
            "trades": resolve_trade_list_for_display(
                drafted.get("trades", []), players, team_names, season_to_league_id
            ),
        }

    return out


def resolve_trade_tree_for_display(tree, players, team_names, season_to_league_id):
    return {
        "trade_id": tree["trade_id"],
        "date": tree["date"],
        "assets": [
            resolve_asset_for_display(
                asset, players, team_names, season_to_league_id, tree["league_id"]
            )
            for asset in tree["assets"]
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    players = fetch_players()

    print("Fetching league history...")
    league_ids = get_league_history(CURRENT_LEAGUE_ID)
    print(f"Found {len(league_ids)} season(s): {league_ids}")

    print("Fetching rosters/users/team names for every season...")
    league_data, team_names = fetch_league_metadata(league_ids)
    season_to_league_id = build_season_to_league_id(league_data)

    print("Fetching draft results for every season...")
    draft_pick_selections = fetch_draft_selections(league_ids, league_data)

    print("Fetching trades for every season (this can take a while)...")
    all_trades = fetch_all_trades(league_ids, league_data)
    print(f"Found {len(all_trades)} trade(s) across all seasons.")

    print("Building trade ledger and asset history...")
    trade_ledger = build_trade_ledger(all_trades)
    asset_history = build_asset_history(trade_ledger)

    print("Building + resolving a tree for every trade, one file each...")
    os.makedirs(TREES_DIR, exist_ok=True)

    # Wipe stale per-trade files from previous runs (e.g. a trade that
    # no longer exists) so the trees/ folder never accumulates orphans.
    for existing in os.listdir(TREES_DIR):
        if existing.endswith(".json"):
            os.remove(os.path.join(TREES_DIR, existing))

    trade_summaries = []
    total_bytes = 0
    biggest = (None, 0)

    for trade in all_trades:
        trade_id = trade["transaction_id"]
        assets = get_trade_assets(trade)
        asset_names = ", ".join(
            resolve_asset_name(a["asset_id"], players, team_names, season_to_league_id)
            for a in assets
        )
        date = datetime.fromtimestamp(
            trade["created"] / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")

        trade_summaries.append(
            {
                "trade_id": trade_id,
                "date": date,
                "season": trade["season"],
                "summary": asset_names,
                "teams": sorted(
                    {
                        resolve_team(trade["league_id"], rid, team_names)["name"]
                        for rid in trade.get("roster_ids", [])
                    }
                ),
            }
        )

        tree = build_trade_tree(trade_id, all_trades, asset_history, draft_pick_selections)
        resolved = resolve_trade_tree_for_display(
            tree, players, team_names, season_to_league_id
        )

        tree_path = os.path.join(TREES_DIR, f"{trade_id}.json")
        with open(tree_path, "w") as f:
            json.dump(resolved, f, separators=(",", ":"))  # no indent - keeps files small

        file_size = os.path.getsize(tree_path)
        total_bytes += file_size
        if file_size > biggest[1]:
            biggest = (trade_id, file_size)

    trade_summaries.sort(key=lambda t: t["date"], reverse=True)

    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "league_id": CURRENT_LEAGUE_ID,
        "trades": trade_summaries,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(INDEX_PATH, "w") as f:
        json.dump(index, f, indent=2)

    print(f"\nWrote {INDEX_PATH} ({len(all_trades)} trades)")
    print(
        f"Wrote {len(all_trades)} tree file(s) to {TREES_DIR} "
        f"({total_bytes / (1024 * 1024):.2f} MB total)"
    )
    if biggest[0]:
        print(f"Largest single tree: {biggest[0]} ({biggest[1] / (1024 * 1024):.2f} MB)")


if __name__ == "__main__":
    main()
