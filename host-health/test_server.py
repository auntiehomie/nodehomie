import unittest
import subprocess
from unittest.mock import patch

import server


class HostHealthTests(unittest.TestCase):
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
