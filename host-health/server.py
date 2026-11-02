#!/usr/bin/env python3
"""Read-only localhost health endpoint for NodeHomie."""
import json
import os
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = int(os.getenv("NODEHOMIE_HEALTH_PORT", "3390"))
CONTAINER = os.getenv("NODEHOMIE_CONTAINER", "hypersnap-hypersnap-1")
DB_PATH = os.getenv("NODEHOMIE_DB_PATH", "/home/homie/hypersnap/.rocks")
STAGING_PATH = os.getenv("NODEHOMIE_STAGING_PATH", "/mnt/hypersnap-staging")
ALLOWED_ORIGIN = os.getenv("NODEHOMIE_ALLOWED_ORIGIN", "")


def docker_json(*args):
    result = subprocess.run(["docker", *args], check=True, capture_output=True, text=True, timeout=5)
    return json.loads(result.stdout)


def collect_health():
    warnings = []
    try:
        details = docker_json("inspect", CONTAINER)[0]
        state = details.get("State", {})
        stats = docker_json("stats", "--no-stream", "--format", "{{json .}}", CONTAINER)
        if isinstance(stats, list):
            stats = stats[0]
        memory = stats.get("MemUsage", "")
        memory_parts = [part.strip() for part in memory.split("/")] if "/" in memory else [memory, None]
        container = {
            "running": bool(state.get("Running")),
            "status": state.get("Status", "unknown"),
            "restart_count": details.get("RestartCount", 0),
            "cpu_percent": str(stats.get("CPUPerc", "")).rstrip("%") or None,
            "memory_usage": memory_parts[0],
            "memory_limit": memory_parts[1],
        }
        if not container["running"]:
            warnings.append("Node container is not running")
    except (subprocess.SubprocessError, OSError, ValueError, IndexError, AttributeError) as exc:
        container = {"running": False, "status": "unavailable", "restart_count": None, "cpu_percent": None, "memory_usage": None}
        warnings.append(f"Docker metrics unavailable: {exc}")

    disks = []
    for name, path in (("database", DB_PATH), ("snapshot staging", STAGING_PATH)):
        try:
            usage = shutil.disk_usage(path)
            disks.append({"name": name, "path": path, "used_percent": round(usage.used / usage.total * 100),
                          "used_bytes": usage.used, "free_bytes": usage.free, "total_bytes": usage.total})
            if usage.free < 100 * 1024**3:
                warnings.append(f"Low free space on {name}: {usage.free // 1024**3} GiB")
        except OSError as exc:
            warnings.append(f"Disk path unavailable ({path}): {exc}")

    return {"container": container, "disks": disks, "warnings": warnings}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/node-healthz"):
            self.send_error(404)
            return
        body = json.dumps(collect_health()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        if ALLOWED_ORIGIN and self.headers.get("Origin") == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    HTTPServer((HOST, PORT), Handler).serve_forever()
