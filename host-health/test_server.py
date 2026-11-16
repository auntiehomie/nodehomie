import unittest
import subprocess
from unittest.mock import patch

import server


class HostHealthTests(unittest.TestCase):
    @patch("server.subprocess.run")
    def test_cast_index_reports_latest_progress_by_shard_and_source(self, run):
        def progress(second, shard, source, count, complete):
            return (
                f"2026-11-16T18:56:{second:02d}.000000000Z INFO "
                "snapchain::api::cast_hash_index: Cast hash store backfill progress "
                f"shard_id={shard} source_prefix={source} casts_indexed={count} "
                f"last_fid=309715 complete={complete}"
            )

        run.return_value.stdout = "\n".join([
            progress(55, 2, 3, 21192888, "false"),
            "An unrelated log message",
            progress(25, 2, 3, 21068327, "false"),
            progress(55, 1, 3, 336, "true"),
            progress(55, 2, 30, 18931666, "false"),
        ])
        started_at = "2026-11-16T18:52:00.000000000Z"
        result = server.collect_cast_index({"Running": True, "StartedAt": started_at})

        self.assertEqual(result["status"], "reported")
        self.assertEqual([(row["shard_id"], row["source_prefix"], row["casts_indexed"], row["complete"])
                          for row in result["sources"]],
                         [(1, 3, 336, True), (2, 3, 21192888, False), (2, 30, 18931666, False)])
        self.assertEqual(result["sources"][1]["last_fid"], 309715)
        self.assertEqual(run.call_args.args[0][2:7],
                         ["--timestamps", "--since", started_at, "--tail", "2000"])

    @patch("server.subprocess.run")
    def test_cast_index_distinguishes_missing_progress_from_failed_log_read(self, run):
        state = {"Running": True, "StartedAt": "2026-11-16T18:52:00Z"}
        run.return_value.stdout = "No progress messages"
        self.assertEqual(server.collect_cast_index(state)["status"], "no_recent_progress")
        run.side_effect = subprocess.TimeoutExpired("docker logs", 2)
        self.assertEqual(server.collect_cast_index(state)["status"], "unavailable")

    @patch("server.shutil.disk_usage")
    @patch("server.docker_json")
    def test_collects_container_and_disk_metrics(self, docker_json, disk_usage):
        docker_json.side_effect = [
            [{"State": {"Running": True, "Status": "running"}, "RestartCount": 2}],
            {"CPUPerc": "12.5%", "MemUsage": "1GiB / 4GiB"},
        ]
        disk_usage.return_value = type("Usage", (), {"used": 100 * 1024**3, "total": 200 * 1024**3, "free": 100 * 1024**3})()

        result = server.collect_health()

        self.assertTrue(result["container"]["running"])
        self.assertEqual(result["container"]["cpu_percent"], "12.5")
        self.assertEqual(result["container"]["memory_limit"], "4GiB")
        self.assertEqual(result["container"]["restart_count"], 2)
        self.assertEqual(result["disks"][0]["used_percent"], 50)
        self.assertEqual(result["warnings"], [])

    @patch("server.shutil.disk_usage", side_effect=OSError("missing"))
    @patch("server.docker_json", side_effect=subprocess.CalledProcessError(1, "docker"))
    def test_unavailable_sources_report_warnings(self, _docker, _disk):
        result = server.collect_health()
        self.assertEqual(result["container"]["status"], "unavailable")
        self.assertEqual(len(result["warnings"]), 3)


if __name__ == "__main__":
    unittest.main()
