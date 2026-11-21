"""Tests for the test gate itself: check.py runs every Python suite, and the default (SQLite) server
suite never follows TURSO_* from the caller's shell. No network: the leaked URL is a closed local port.
Run:  python -m unittest tests/test_check.py -v
"""
import json
import os
import socket
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import check  # noqa: E402


def closed_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class ServerSuiteEnvTest(unittest.TestCase):
    def test_sqlite_run_ignores_turso_env_from_the_shell(self):
        env = dict(os.environ)
        env.pop("GITASAARTHI_TEST_BACKEND", None)
        env["TURSO_DATABASE_URL"] = f"http://127.0.0.1:{closed_port()}"
        env["TURSO_AUTH_TOKEN"] = "leaked-token"
        r = subprocess.run([sys.executable, "-m", "unittest", "tests.test_server.ServerTest.test_public_pages",
                            "tests.test_server.ServerTest.test_root_logged_out_is_sign_in"],
                           cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        self.assertNotIn("Turso", r.stderr)


class CheckCommandsTest(unittest.TestCase):
    def setUp(self):
        self.cmds = check.python_test_runs()

    def test_every_python_suite_runs(self):
        names = " ".join(" ".join(cmd) for _, cmd, _ in self.cmds)
        for suite in ("test_server.py", "test_turso_adapter.py", "test_copy.py", "test_check.py"):
            self.assertIn(suite, names)
        found = {os.path.basename(p) for p in __import__("glob").glob(os.path.join(ROOT, "tests", "test_*.py"))}
        for suite in found:
            self.assertIn(suite, names, "a tests/test_*.py file is not run by check.py")

    def test_server_suite_runs_on_both_backends_and_sqlite_run_drops_turso_env(self):
        server_runs = [(cmd, env) for _, cmd, env in self.cmds if any("test_server.py" in a for a in cmd)]
        backends = sorted((env or {}).get("GITASAARTHI_TEST_BACKEND", "") for _, env in server_runs)
        self.assertEqual(backends, ["", "turso-stub"])
        leak = {"TURSO_DATABASE_URL": "http://127.0.0.1:9", "TURSO_AUTH_TOKEN": "t"}
        for _, _, env_fn in self.cmds:
            child = check.child_env(env_fn, base=leak)
            self.assertNotIn("TURSO_DATABASE_URL", child)
            self.assertNotIn("TURSO_AUTH_TOKEN", child)


class VercelRegionTest(unittest.TestCase):
    def test_function_region_is_pinned(self):
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        regions = cfg.get("regions")
        self.assertIsInstance(regions, list)
        self.assertEqual(len(regions), 1)          # Hobby deploys functions to one region
        self.assertRegex(regions[0], r"^[a-z]{3}\d$")


if __name__ == "__main__":
    unittest.main()
