"""Bounded local incident recorder. Only classified fields leave the host."""
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
from contextlib import closing
from datetime import datetime, timezone
from urllib.request import urlopen

DB = os.path.join(os.getenv("STATE_DIRECTORY", "/var/lib/nodehomie-host-health"), "incidents.sqlite3")
RULES = [
    (r"\bStarting (?:Snapchain|Hypersnap) validator node with public key:", "Node mode", "Started in validator mode"),
    (r"\bStarting (?:Snapchain|Hypersnap) read node with public key:", "Node mode", "Started in read-node mode"),
    (r"\bRead node requesting vote set\b", "Consensus", "Read node requested a vote set"),
    (r"\bRead node received vote set request\b", "Consensus", "Read node received a vote-set request"),
    (r"\bRead node sending vote set response\b", "Consensus", "Read node logged a vote-set response"),
    (r"\bReceived prior-round votes for re-proposal\b", "Consensus", "Received prior-round votes"),
    (r"\blocally signed (?:a )?vote\b", "Consensus", "Local vote signing reported"),
    (r"\blocally signed (?:a )?proposal\b", "Consensus", "Local proposal signing reported"),
    (r"merkle.*mismatch|trie root.*mismatch", "Validation", "Trie root mismatch"),
    (r"buffer i/o error|input/output error", "Storage", "I/O error"),
    (r"\b(disconnected|connection closed)\b", "Peer", "Peer connection closed"),
    (r"\b(connection established|peer connected)\b", "Peer", "Peer connection established"),
    (r"\bconsensus\b.*\btimeout|timed out.*\bconsensus\b", "Consensus", "Consensus timeout"),
    (r"\bERROR\b", "Error", "Container logged an error"),
    (r"\bWARN\b", "Warning", "Container logged a warning"),
]


def classify(line):
    clean = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", line)
    for pattern, category, label in RULES:
        if re.search(pattern, clean, re.I):
            for field in ("shard_id", "height", "round"):
                match = re.search(rf"\b{field}=(\d{{1,18}})\b", clean)
                if match:
                    label += f" {field}={match[1]}"
            return category, label


def record(db, stamp, kind, message):
    db.execute("INSERT INTO events VALUES (?,?,?)", (stamp, kind, message))


def sample(db, container, previous, now, state):
    start = previous if previous and now - previous <= 90 else now - 30
    if previous is None or start != previous:
        record(db, now, "Recorder", "Recording started or resumed after a gap")
    try:
        result = subprocess.run(
            ["docker", "logs", "--timestamps", "--since", str(start), "--until", str(now),
             "--tail", "1001", container], check=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=5, text=True, errors="replace")
        lines = result.stdout.splitlines()
        if len(lines) == 1001:
            record(db, now, "Recorder", "Log window reached its line limit")
        for line in lines:
            stamp, _, body = line.partition(" ")
            event = classify(body)
            if event:
                try:
                    when = datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    continue
                if start <= when < now:
                    record(db, when, *event)
        logs = "Container log collection available"
    except (OSError, subprocess.SubprocessError):
        logs = "Container logs unavailable"
    transition(db, state, "logs", logs, now)
    try:
        started = subprocess.check_output(
            ["docker", "inspect", "--format", "{{.State.StartedAt}}", container],
            text=True, timeout=3, stderr=subprocess.DEVNULL).strip()
        if re.fullmatch(r"[0-9T:.Z+-]+", started):
            transition(db, state, "start", f"Container start time {started}", now)
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        with urlopen("http://127.0.0.1:3381/v1/info", timeout=3) as response:
            info = json.load(response)
        version = str(info.get("version", ""))
        if re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?", version):
            transition(db, state, "version", f"Node version {version}", now)
        mode = info.get("readNode", info.get("read_node"))
        if isinstance(mode, bool):
            transition(db, state, "mode", f"Read-node mode {mode}", now)
        shards = info.get("shardInfos", info.get("shard_infos", []))
        for shard in shards:
            sid = int(shard.get("shardId", shard.get("shard_id")))
            height = int(shard.get("maxHeight", shard.get("max_height")))
            key = f"shard {sid}"
            old, changed, quiet = state.get(key, (None, now, False))
            if height != old:
                if old is None or quiet or height < old:
                    record(db, now, "Shard", f"{key} observed at {height} (previous {old})" if old is not None else f"{key} observed at {height}")
                state[key] = (height, now, False)
            elif not quiet and now - changed >= 300:
                record(db, now, "Shard", f"{key} unchanged for five minutes at {height}")
                state[key] = (height, changed, True)
        rpc = "Local node information available"
    except (OSError, ValueError, TypeError, AttributeError):
        rpc = "Local node information unavailable"
        for key in list(state):
            if key.startswith("shard "):
                del state[key]
    transition(db, state, "rpc", rpc, now)


def transition(db, state, key, message, now):
    if state.get(key) != message:
        record(db, now, "Recorder", message)
        state[key] = message


def run(container):
    state = {}
    previous = None
    while True:
        now = int(time.time())
        try:
            with closing(sqlite3.connect(DB)) as db, db:
                db.execute("CREATE TABLE IF NOT EXISTS events (stamp REAL, kind TEXT, message TEXT)")
                sample(db, container, previous, now, state)
                db.execute("DELETE FROM events WHERE rowid <= (SELECT max(rowid) - 2000 FROM events)")
            previous = now
        except sqlite3.Error:
            previous = None
            state.clear()
        time.sleep(30)


def start(container):
    threading.Thread(target=run, args=(container,), daemon=True).start()


def recent():
    try:
        with closing(sqlite3.connect(f"file:{DB}?mode=ro", uri=True)) as db:
            rows = db.execute("SELECT stamp, kind, message FROM events ORDER BY stamp DESC, rowid DESC LIMIT 100")
            return [{"time": datetime.fromtimestamp(t, timezone.utc).isoformat(), "kind": k, "message": m}
                    for t, k, m in rows]
    except sqlite3.Error:
        return None
