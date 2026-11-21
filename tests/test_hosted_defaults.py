"""Defaults that must differ between a developer's laptop and a hosted deployment."""
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def server_flag(env_extra):
    env = {k: v for k, v in os.environ.items() if not k.startswith(("VERCEL", "GITASAARTHI_", "TURSO_"))}
    env.update(env_extra)
    out = subprocess.run(
        [sys.executable, "-c", "import server; print(server.SECURE_COOKIE)"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=30,
    )
    return out.stdout.strip().splitlines()[-1] if out.stdout.strip() else out.stderr[-300:]


class HostedDefaults(unittest.TestCase):
    def test_session_cookie_is_secure_on_vercel_without_extra_setting(self):
        self.assertEqual(server_flag({"VERCEL": "1"}), "True")

    def test_session_cookie_is_not_secure_on_a_plain_laptop(self):
        self.assertEqual(server_flag({}), "False")

    def test_explicit_secure_flag_still_works_locally(self):
        self.assertEqual(server_flag({"GITASAARTHI_SECURE_COOKIE": "1"}), "True")

    def test_vercel_ignore_keeps_local_settings_and_data_out(self):
        with open(os.path.join(ROOT, ".vercelignore"), encoding="utf-8") as f:
            lines = {ln.strip() for ln in f if ln.strip() and not ln.startswith("#")}
        for must in (".claude/", "data/", "_archive/", "node_modules/", "secret.key"):
            self.assertIn(must, lines)


class VercelRuntimeNames(unittest.TestCase):
    """Vercel's Python runtime wraps our handler class and defines its own methods on the subclass.
    A same-named method of ours would be overridden and call itself forever (an infinite loop on every request)."""

    RESERVED = ("handle_request",)

    def test_handler_does_not_define_names_the_vercel_runtime_uses(self):
        sys.path.insert(0, ROOT)
        import server
        for name in self.RESERVED:
            self.assertNotIn(name, vars(server.Handler), f"{name} collides with the Vercel runtime wrapper")


class VercelRoutesEverythingThroughPython(unittest.TestCase):
    """On Vercel a rewrite runs only after the platform looks for a matching file, so with 'rewrites' the
    HTML, CSS and JS in this folder are served straight from the CDN: no sign-in gate, no security headers.
    'routes' with no filesystem handler sends every request to the Python function instead."""

    def setUp(self):
        import json
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
            self.cfg = json.load(f)

    def test_no_catch_all_rewrite(self):
        for r in self.cfg.get("rewrites", []):
            self.assertNotIn(r.get("source"), ("/(.*)", "/:path*", "/(.*)"), "a catch-all rewrite lets static files skip the server")

    def test_every_path_is_routed_to_the_function(self):
        routes = self.cfg.get("routes", [])
        self.assertTrue(any(r.get("src") == "/(.*)" and r.get("dest") == "/api/index" for r in routes))
        self.assertFalse(any(r.get("handle") == "filesystem" for r in routes), "the filesystem handler would serve files directly")


if __name__ == "__main__":
    unittest.main()
