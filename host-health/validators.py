"""Sample the local node's committed votes and its mounted validator schedule."""
import base64
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from urllib.request import urlopen

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
PROTO = Path(__file__).resolve().with_name("certificates.proto")
snapshot = None


def peer_id(key):
    # Identity multihash containing the protobuf-encoded Ed25519 public key.
    number = int.from_bytes(bytes.fromhex("002408011220") + key, "big")
    digits = ""
    while number:
        number, digit = divmod(number, 58)
        digits = ALPHABET[digit] + digits
    return "1" + digits


def signing_key(identity):
    configured = os.getenv("NODEHOMIE_VALIDATOR_PUBLIC_KEY", "").strip()
    if configured:
        key = bytes.fromhex(configured)
        if len(key) != 32:
            raise ValueError("Invalid validator public key")
        return key
    if not isinstance(identity, str) or len(identity) != 52:
        return None
    number = 0
    for digit in identity:
        number = number * 58 + ALPHABET.index(digit)
    raw = number.to_bytes(38, "big")
    if raw.startswith(bytes.fromhex("002408011220")) and peer_id(raw[6:]) == identity:
        return raw[6:]
    return None


def active_peers(schedule, shard, height):
    eligible = [entry for entry in schedule if shard in entry["shard_ids"] and entry["effective_at"] <= height]
    if eligible:
        keys = max(eligible, key=lambda entry: entry["effective_at"])["validator_public_keys"]
        return [peer_id(bytes.fromhex(key)) for key in keys]
    return None


def certificates(shard, start, stop):
    args = {"startBlockNumber": str(start), "stopBlockNumber": str(stop)}
    method = "GetBlocks"
    if shard:
        method = "GetShardChunks"
        args["shardId"] = shard
    output = subprocess.check_output([
        "docker", "run", "--rm", "--pull=never", "--network", "host",
        "-v", f"{PROTO}:/schema/check.proto:ro", "fullstorydev/grpcurl:v1.9.3",
        "-plaintext", "-max-time", "8", "-import-path", "/schema", "-proto", "check.proto",
        "-d", json.dumps(args), "127.0.0.1:3383", f"HubService/{method}"
    ], text=True, timeout=12, stderr=subprocess.DEVNULL)
    if shard:
        return json.loads(output).get("shardChunks", [])
    blocks = []
    decoder = json.JSONDecoder()
    output = output.strip()
    while output:
        block, end = decoder.raw_decode(output)
        blocks.append(block)
        output = output[end:].lstrip()
    return blocks


def summarize(blocks, shard, start, tip, key):
    checked = set()
    signed = set()
    signer = base64.b64encode(key).decode()
    for block in blocks:
        cert = block.get("commits", {})
        height = cert.get("height", {})
        number = int(height.get("blockNumber", -1))
        if int(height.get("shardIndex", 0)) != shard or not start <= number <= tip:
            continue
        votes = [v for v in cert.get("signatures", []) if v.get("signature") and v.get("signer")]
        if votes:
            checked.add(number)
        if any(v["signer"] == signer for v in votes):
            signed.add(number)
    return {"checked": len(checked), "signed": len(signed), "last": max(signed, default=None)}


def collect(container):
    with urlopen("http://127.0.0.1:3381/v1/info", timeout=4) as response:
        info = json.load(response)
    identity = info.get("peerId", info.get("peer_id"))
    key = signing_key(identity)
    schedule = []
    if tomllib:
        try:
            raw = subprocess.check_output(["docker", "exec", container, "cat", "/app/validators.toml"],
                                          text=True, timeout=4, stderr=subprocess.DEVNULL)
            schedule = tomllib.loads(raw)["consensus"]["validator_sets"]
        except (KeyError, ValueError, OSError, subprocess.SubprocessError):
            pass
    result = {"checked_at": int(time.time()), "identity": identity, "shards": []}
    for item in info.get("shardInfos", info.get("shard_infos", [])):
        shard = int(item.get("shardId", item.get("shard_id")))
        tip = int(item.get("maxHeight", item.get("max_height")))
        row = {"id": shard, "height": tip, "active": active_peers(schedule, shard, tip),
               "delay": item.get("blockDelay", item.get("block_delay")), "votes": None}
        if key and tip > 0:
            start = max(1, tip - 5)
            try:
                row["votes"] = summarize(certificates(shard, start, tip + 1), shard, start, tip, key)
            except (ValueError, OSError, subprocess.SubprocessError):
                pass
        result["shards"].append(row)
    return result


def start(container):
    def poll():
        global snapshot
        while True:
            try:
                snapshot = collect(container)
            except (OSError, ValueError, TypeError, OverflowError, KeyError, AttributeError):
                # Keep last successful timestamp so the UI can mark stale observations.
                pass
            time.sleep(60)
    threading.Thread(target=poll, daemon=True).start()
