"""Optimistic concurrency on saved data: each key carries a rev; a stale base_rev gets a 409.
Run:  python -m unittest tests/test_data_revisions.py -v
(also with GITASAARTHI_TEST_BACKEND=turso-stub, like tests/test_server.py)
"""
import os
import sys
import tempfile
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402
from test_server import Client, setUpModule, tearDownModule, reset_stub_throttle  # noqa: E402,F401


class RevisionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = os.path.join(cls.tmp.name, "rev.db")
        cls.httpd = server.build_server(0, cls.db)
        reset_stub_throttle()
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.n = 0

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def user(self, email=None):
        type(self).n += 1
        c = Client(self.port)
        st, _, body = c.req("POST", "/api/signup", {"name": "A", "email": email or f"r{self.n}@example.com",
                                                    "password": "correct horse"})
        self.assertEqual(st, 201, body)
        return c

    def login(self, email):
        c = Client(self.port)
        st, _, body = c.req("POST", "/api/login", {"email": email, "password": "correct horse"})
        self.assertEqual(st, 200, body)
        return c

    def put(self, c, key, value, **extra):
        return c.req("PUT", f"/api/me/data/{key}", {"value": value, **extra})

    def test_rev_starts_at_1_and_is_in_get(self):
        c = self.user()
        self.assertEqual(self.put(c, "last", {"verse": 1})[2:], ({"ok": True, "rev": 1},))
        st, _, data = c.req("GET", "/api/me/data")
        self.assertEqual(data["last"], {"verse": 1})
        self.assertEqual(data["_rev"], {"last": 1})

    def test_get_has_empty_rev_for_new_user(self):
        st, _, data = self.user().req("GET", "/api/me/data")
        self.assertEqual(data, {"_rev": {}})

    def test_matching_base_rev_increments(self):
        c = self.user()
        self.put(c, "last", {"verse": 1})
        st, _, body = self.put(c, "last", {"verse": 2}, base_rev=1)
        self.assertEqual((st, body), (200, {"ok": True, "rev": 2}))

    def test_first_save_with_base_rev_zero(self):
        c = self.user()
        st, _, body = self.put(c, "last", {"verse": 1}, base_rev=0)
        self.assertEqual((st, body), (200, {"ok": True, "rev": 1}))

    def test_stale_base_rev_conflicts_and_writes_nothing(self):
        c = self.user()
        self.put(c, "last", {"verse": 1})
        self.put(c, "last", {"verse": 2})
        st, _, body = self.put(c, "last", {"verse": 99}, base_rev=1)
        self.assertEqual(st, 409)
        self.assertEqual(body, {"error": "Another device saved newer data. Merge and save again.",
                                "code": "conflict", "value": {"verse": 2}, "rev": 2})
        data = c.req("GET", "/api/me/data")[2]
        self.assertEqual((data["last"], data["_rev"]["last"]), ({"verse": 2}, 2))

    def test_base_rev_on_missing_row_conflicts_with_null(self):
        c = self.user()
        st, _, body = self.put(c, "last", {"verse": 1}, base_rev=5)
        self.assertEqual((st, body["code"], body["value"], body["rev"]), (409, "conflict", None, 0))
        self.assertEqual(c.req("GET", "/api/me/data")[2], {"_rev": {}})

    def test_two_devices_race(self):
        a = self.user("race@example.com")
        for i in range(3):
            self.put(a, "journal", [], base_rev=i)
        b = self.login("race@example.com")
        self.assertEqual(b.req("GET", "/api/me/data")[2]["_rev"]["journal"], 3)
        self.assertEqual(a.req("GET", "/api/me/data")[2]["_rev"]["journal"], 3)
        st, _, body = self.put(a, "journal", [], base_rev=3)
        self.assertEqual((st, body["rev"]), (200, 4))
        st, _, body = self.put(b, "journal", [], base_rev=3)
        self.assertEqual((st, body["code"], body["rev"]), (409, "conflict", 4))

    def test_without_base_rev_is_last_write_wins_but_bumps_rev(self):
        c = self.user()
        self.put(c, "last", {"verse": 1})
        st, _, body = self.put(c, "last", {"verse": 2})
        self.assertEqual((st, body), (200, {"ok": True, "rev": 2}))
        self.assertEqual(c.req("GET", "/api/me/data")[2]["last"], {"verse": 2})

    def test_bad_base_rev_is_400(self):
        c = self.user()
        for bad in ("1", -1, True, False, 1.5, None, [1]):
            st, _, body = self.put(c, "last", {"verse": 1}, base_rev=bad)
            self.assertEqual(st, 400, bad)
        self.assertEqual(c.req("GET", "/api/me/data")[2], {"_rev": {}})

    def test_validation_still_applies_with_base_rev(self):
        c = self.user()
        st, _, _ = self.put(c, "moods", [], base_rev=0)
        self.assertEqual(st, 400)

    def test_keys_and_users_are_independent(self):
        a, b = self.user(), self.user()
        self.put(a, "last", {"verse": 1})
        self.put(a, "last", {"verse": 2})
        self.assertEqual(self.put(a, "moods", {})[2]["rev"], 1)
        self.assertEqual(self.put(b, "last", {"verse": 7}, base_rev=0)[2:], ({"ok": True, "rev": 1},))
        self.assertEqual(b.req("GET", "/api/me/data")[2]["_rev"], {"last": 1})


class MigrationTest(unittest.TestCase):
    def test_old_schema_gains_rev_and_keeps_rows(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        db = os.path.join(tmp.name, "old.db")
        server.init_db(db)                       # full current schema, then rewind user_data to the old shape
        conn = server.connect(db)
        try:
            conn.execute("INSERT INTO users (name, email, password_hash, created_at) VALUES ('A','m@e.com','x','t')")
            uid = conn.execute("SELECT id FROM users WHERE email='m@e.com'").fetchone()[0]
            conn.execute("DROP TABLE user_data")
            conn.execute("CREATE TABLE user_data (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                         "key TEXT NOT NULL CHECK (key IN ('practice', 'moods', 'journal', 'last')), "
                         "value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, key))")
            conn.execute("INSERT INTO user_data VALUES (?, 'last', '{\"v\":1}', 't')", (uid,))
            conn.commit()
        finally:
            conn.close()
        for _ in range(2):                       # second run must be a no-op
            server.init_db(db)
            conn = server.connect(db)
            try:
                cols = [r[1] for r in conn.execute("PRAGMA table_info(user_data)").fetchall()]
                self.assertEqual(cols.count("rev"), 1)
                row = conn.execute("SELECT value, rev FROM user_data WHERE user_id = ?", (uid,)).fetchone()
                self.assertEqual((row[0], row[1]), ('{"v":1}', 0))
            finally:
                conn.close()


if __name__ == "__main__":
    unittest.main()
