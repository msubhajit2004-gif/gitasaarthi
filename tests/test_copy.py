"""Tests for scripts/copy_to_turso.py (SQLite -> Turso migration).
Run:  python -m unittest tests/test_copy.py -v
No network: the destination is a temp SQLite file or the local Turso stub from tests/test_turso_adapter.py.
"""
import base64
import contextlib
import importlib.util
import io
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import server  # noqa: E402
import db_turso  # noqa: E402
from test_turso_adapter import start_stub  # noqa: E402

_spec = importlib.util.spec_from_file_location("copy_to_turso", os.path.join(ROOT, "scripts", "copy_to_turso.py"))
copy_to_turso = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(copy_to_turso)

ENV_KEYS = ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GITASAARTHI_MASTER_KEY", "GITASAARTHI_SECRET_KEY_FILE", "VERCEL")
TABLES = ("users", "user_data", "events", "user_secrets")
JOURNAL = "a very private journal line about my mother"
GEMINI_KEY = "AIzaSy-test-gemini-key-0123456789"


@contextlib.contextmanager
def clean_env():
    with mock.patch.dict(os.environ):
        for k in ENV_KEYS:
            os.environ.pop(k, None)
        yield


def build_source(tmp, old_key, corrupt=False):
    """A source DB like a real local install: two users, data, events, a session, throttle rows, a secret."""
    path = os.path.join(tmp, "src.db")
    with clean_env():
        server.init_db(path)
    c = sqlite3.connect(path)
    c.execute("PRAGMA foreign_keys = ON")
    now = "2026-11-01T00:00:00Z"
    c.execute("INSERT INTO users(id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)",
              (3, "asha@example.com", "Asha", server.hash_password("correct horse 1"), "admin", now))
    c.execute("INSERT INTO users(id, email, name, password_hash, role, created_at, last_active_at) "
              "VALUES (?,?,?,?,?,?,?)",
              (7, "ravi@example.com", "Ravi", server.hash_password("battery staple 2"), "user", now, now))
    c.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (3, 'journal', ?, ?)", (f'[{{"text": "{JOURNAL}"}}]', now))
    c.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (7, 'moods', '[1,2,3]', ?)", (now,))
    c.execute("INSERT INTO events(id, user_id, type, topic, created_at, reviewed_at, reviewed_by) "
              "VALUES (11, 7, 'crisis_shown', 'grief', ?, ?, 3)", (now, now))
    c.execute("INSERT INTO events(id, user_id, type, topic, created_at) VALUES (12, 3, 'conversation', 'anger', ?)",
              (now,))
    c.execute("INSERT INTO sessions VALUES ('tokhash', 3, ?, ?, '2099-01-01T00:00:00Z')", (now, now))
    c.execute("INSERT INTO throttle_events VALUES ('login', 'ip:1.2.3.4', 1.0)")
    blob = '{"apiKey": "%s", "enabled": true, "model": "gemini-2.5-flash"}' % GEMINI_KEY
    c.execute("INSERT INTO user_secrets VALUES (3, 'gemini', ?, ?)", (server.encrypt_secret(blob, old_key), now))
    if corrupt:
        c.execute("INSERT INTO user_secrets VALUES (7, 'gemini', 'v1:AAAA', ?)", (now,))
    c.commit()
    c.close()
    return path


class CopyBase:
    """Shared scenarios; subclasses provide dst() (a fresh connection) and raw() (direct sqlite for asserts)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_key = os.urandom(32)
        self.new_key = os.urandom(32)
        self.new_b64 = base64.b64encode(self.new_key).decode()
        self.old_key_path = os.path.join(self.tmp.name, "secret.key")
        with open(self.old_key_path, "wb") as f:
            f.write(self.old_key)
        self.reset_dst()

    def tearDown(self):
        self.tmp.cleanup()

    def run_copy(self, src, dry_run=False):
        conn = self.dst()
        try:
            with clean_env(), contextlib.redirect_stdout(io.StringIO()) as out:
                counts = copy_to_turso.copy(src, conn, self.old_key_path, self.new_b64, dry_run=dry_run)
        finally:
            conn.close()
        self.last_out = out.getvalue()
        return counts

    def snapshot(self):
        r = self.raw()
        try:
            return {t: r.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall() for t in TABLES}
        finally:
            r.close()

    def test_counts_match_and_sessions_throttle_skipped(self):
        src = build_source(self.tmp.name, self.old_key)
        counts = self.run_copy(src)
        self.assertEqual(counts, {"users": 2, "user_data": 2, "events": 2, "user_secrets": 1, "secrets_skipped": 0,
                                  "deleted_on_destination": 0})
        r = self.raw()
        try:
            for t in TABLES:
                self.assertEqual(r.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0], counts[t], t)
            self.assertEqual(r.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 0)
            self.assertEqual(r.execute("SELECT COUNT(*) FROM throttle_events").fetchone()[0], 0)
            # ids preserved, so foreign keys line up
            self.assertEqual(r.execute("SELECT id, email, role FROM users ORDER BY id").fetchall(),
                             [(3, "asha@example.com", "admin"), (7, "ravi@example.com", "user")])
            self.assertEqual(r.execute("SELECT id, user_id, reviewed_by FROM events ORDER BY id").fetchall(),
                             [(11, 7, 3), (12, 3, None)])
            self.assertEqual(r.execute("SELECT value FROM user_data WHERE user_id=3").fetchone()[0],
                             f'[{{"text": "{JOURNAL}"}}]')
        finally:
            r.close()

    def test_passwords_still_verify_on_destination(self):
        self.run_copy(build_source(self.tmp.name, self.old_key))
        r = self.raw()
        try:
            hashes = dict(r.execute("SELECT email, password_hash FROM users").fetchall())
        finally:
            r.close()
        self.assertTrue(server.verify_password("correct horse 1", hashes["asha@example.com"]))
        self.assertTrue(server.verify_password("battery staple 2", hashes["ravi@example.com"]))
        self.assertFalse(server.verify_password("correct horse 1", hashes["ravi@example.com"]))

    def test_secret_reencrypted_with_new_key_only(self):
        src = build_source(self.tmp.name, self.old_key)
        s = sqlite3.connect(src)
        old_blob = s.execute("SELECT value FROM user_secrets").fetchone()[0]
        s.close()
        self.run_copy(src)
        r = self.raw()
        try:
            new_blob = r.execute("SELECT value FROM user_secrets WHERE user_id=3 AND name='gemini'").fetchone()[0]
        finally:
            r.close()
        self.assertNotEqual(new_blob, old_blob)
        self.assertIn(GEMINI_KEY, server.decrypt_secret(new_blob, self.new_key))
        self.assertIsNone(server.decrypt_secret(new_blob, self.old_key))

    def test_second_run_is_idempotent_and_keeps_destination_only_rows(self):
        src = build_source(self.tmp.name, self.old_key)
        first = self.run_copy(src)
        snap1 = self.snapshot()
        # a session created on the destination after the first copy must survive a re-run (no REPLACE cascade)
        r = self.raw()
        r.execute("INSERT INTO sessions VALUES ('prodsession', 3, 'x', 'x', '2099-01-01T00:00:00Z')")
        r.commit()
        r.close()
        second = self.run_copy(src)
        snap2 = self.snapshot()
        self.assertEqual(first, second)
        for t in ("users", "user_data", "events"):
            self.assertEqual(snap1[t], snap2[t], t)
        self.assertEqual([row[:2] for row in snap1["user_secrets"]], [row[:2] for row in snap2["user_secrets"]])
        self.assertIn(GEMINI_KEY, server.decrypt_secret(snap2["user_secrets"][0][2], self.new_key))
        r = self.raw()
        try:
            self.assertEqual(r.execute("SELECT COUNT(*) FROM sessions WHERE token_hash='prodsession'").fetchone()[0], 1)
        finally:
            r.close()

    # ---- re-runs against a destination that has taken signups and edits since the first copy
    def dst_exec(self, sql, params=()):
        r = self.raw()
        try:
            r.execute(sql, params)
            r.commit()
        finally:
            r.close()

    def dst_all(self, sql, params=()):
        r = self.raw()
        try:
            return r.execute(sql, params).fetchall()
        finally:
            r.close()

    def src_exec(self, src, sql, params=()):
        s = sqlite3.connect(src)
        try:
            s.execute(sql, params)
            s.commit()
        finally:
            s.close()

    def assert_refused(self, src, dry_run=False):
        before = self.snapshot()
        with self.assertRaises(copy_to_turso.CopyConflict) as cm:
            self.run_copy(src, dry_run=dry_run)
        self.assertIsInstance(cm.exception, ValueError)    # main() turns it into a refusal exit
        self.assertEqual(self.snapshot(), before)          # nothing written
        for s in ("@example.com", "scrypt$", JOURNAL):
            self.assertNotIn(s, str(cm.exception))
        return str(cm.exception)

    def test_rerun_refuses_when_id_is_another_hosted_account(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        hosted_hash = server.hash_password("hosted pw 8")
        self.dst_exec("INSERT INTO users(id, email, name, password_hash, role, created_at) VALUES (8, ?, 'H', ?, "
                      "'user', 'x')", ("hosted8@example.com", hosted_hash))
        self.dst_exec("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (8, 'journal', 'hosted journal', 'x')")
        self.src_exec(src, "INSERT INTO users(id, email, name, password_hash, role, created_at) VALUES (8, ?, 'L', "
                           "'scrypt$local', 'admin', 'x')", ("local8@example.com",))
        self.src_exec(src, "INSERT INTO user_data (user_id, key, value, updated_at) VALUES (8, 'journal', 'local journal', 'zzzz')")
        msg = self.assert_refused(src)
        self.assertIn("8", msg)
        self.assertEqual(self.dst_all("SELECT email, password_hash, role FROM users WHERE id = 8"),
                         [("hosted8@example.com", hosted_hash, "user")])
        self.assert_refused(src, dry_run=True)

    def test_rerun_refuses_when_email_is_hosted_under_another_id(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        self.dst_exec("INSERT INTO users(id, email, name, password_hash, created_at) VALUES (20, ?, 'N', 'h', 'x')",
                      ("New@Example.com",))
        self.src_exec(src, "INSERT INTO users(id, email, name, password_hash, created_at) VALUES (8, ?, 'N', 'h', 'x')",
                      ("new@example.com",))
        self.assert_refused(src)

    def test_rerun_refuses_when_event_id_is_a_different_hosted_event(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        self.dst_exec("INSERT INTO events(id, user_id, type, topic, created_at) VALUES (13, 7, 'conversation', 'a', 'h')")
        self.src_exec(src, "INSERT INTO events(id, user_id, type, topic, created_at) VALUES (13, 3, 'crisis_shown', "
                           "'b', 'l')")
        self.assert_refused(src)

    def test_rerun_keeps_hosted_edits_and_takes_only_newer_local_data(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        later = "2026-11-20T00:00:00+00:00"
        self.dst_exec("UPDATE user_data SET value = 'hosted edit', updated_at = ? WHERE user_id = 3", (later,))
        self.dst_exec("UPDATE users SET password_hash = 'scrypt$changed-on-hosted', role = 'user' WHERE id = 3")
        self.dst_exec("UPDATE events SET reviewed_at = 'h' WHERE id = 12")
        self.src_exec(src, "UPDATE user_data SET value = '[9]', updated_at = ? WHERE user_id = 7", (later,))
        self.src_exec(src, "INSERT INTO users(id, email, name, password_hash, created_at) VALUES (8, ?, 'N', 'h', 'x')",
                      ("eight@example.com",))
        self.run_copy(src)
        self.assertEqual(self.dst_all("SELECT key, value FROM user_data WHERE user_id = 3"), [("journal", "hosted edit")])
        self.assertEqual(self.dst_all("SELECT value FROM user_data WHERE user_id = 7"), [("[9]",)])
        self.assertEqual(self.dst_all("SELECT password_hash, role FROM users WHERE id = 3"),
                         [("scrypt$changed-on-hosted", "user")])
        self.assertEqual(self.dst_all("SELECT reviewed_at FROM events WHERE id = 12"), [("h",)])
        self.assertEqual(self.dst_all("SELECT email FROM users WHERE id = 8"), [("eight@example.com",)])

    def test_rerun_does_not_restore_an_account_deleted_on_destination(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        r = self.raw()
        try:
            r.execute("PRAGMA foreign_keys = ON")
            r.execute("DELETE FROM users WHERE id = 7")        # the user deleted their account on the live site
            r.commit()
        finally:
            r.close()
        self.src_exec(src, "INSERT INTO user_data (user_id, key, value, updated_at) VALUES (7, 'journal', 'written locally later', 'zzzz')")
        counts = self.run_copy(src)
        self.assertEqual(self.dst_all("SELECT id FROM users"), [(3,)])
        self.assertEqual(self.dst_all("SELECT COUNT(*) FROM user_data WHERE user_id = 7"), [(0,)])
        self.assertEqual(self.dst_all("SELECT id FROM events"), [(12,)])
        self.assertGreater(counts["deleted_on_destination"], 0)
        self.run_copy(src)                                     # and stays deleted
        self.assertEqual(self.dst_all("SELECT id FROM users"), [(3,)])

    def test_rerun_does_not_restore_a_gemini_key_removed_on_destination(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        self.dst_exec("DELETE FROM user_secrets")
        self.run_copy(src)
        self.assertEqual(self.dst_all("SELECT COUNT(*) FROM user_secrets"), [(0,)])

    def test_rerun_keeps_a_newer_hosted_gemini_key(self):
        src = build_source(self.tmp.name, self.old_key)
        self.run_copy(src)
        hosted = server.encrypt_secret('{"apiKey": "hosted-key"}', self.new_key)
        self.dst_exec("UPDATE user_secrets SET value = ?, updated_at = '2026-11-20T00:00:00+00:00'", (hosted,))
        self.run_copy(src)
        self.assertEqual(self.dst_all("SELECT value FROM user_secrets"), [(hosted,)])

    def test_dry_run_writes_nothing(self):
        src = build_source(self.tmp.name, self.old_key, corrupt=True)
        counts = self.run_copy(src, dry_run=True)
        self.assertEqual(counts, {"users": 2, "user_data": 2, "events": 2, "user_secrets": 1, "secrets_skipped": 1,
                                  "deleted_on_destination": 0})
        r = self.raw()
        try:
            tables = [row[0] for row in r.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        finally:
            r.close()
        self.assertNotIn("users", tables)
        self.assertIn("users", self.last_out)   # counts are printed

    def test_corrupted_blob_skipped_never_copied_raw(self):
        src = build_source(self.tmp.name, self.old_key, corrupt=True)
        for _ in range(2):
            counts = self.run_copy(src)
            self.assertEqual(counts["user_secrets"], 1)
            self.assertEqual(counts["secrets_skipped"], 1)
        r = self.raw()
        try:
            self.assertEqual(r.execute("SELECT user_id FROM user_secrets").fetchall(), [(3,)])
            self.assertEqual(r.execute("SELECT COUNT(*) FROM user_secrets WHERE value='v1:AAAA'").fetchone()[0], 0)
        finally:
            r.close()

    def test_output_has_only_counts(self):
        src = build_source(self.tmp.name, self.old_key, corrupt=True)
        self.run_copy(src)
        out = self.last_out
        for secret in ("asha@example.com", "ravi@example.com", "scrypt$", JOURNAL, GEMINI_KEY, self.new_b64,
                       base64.b64encode(self.old_key).decode(), "v1:"):
            self.assertNotIn(secret, out)


class CopyToSqliteTest(CopyBase, unittest.TestCase):
    def reset_dst(self):
        self.dst_path = os.path.join(self.tmp.name, "dst.db")

    def dst(self):
        c = sqlite3.connect(self.dst_path)
        c.execute("PRAGMA foreign_keys = ON")
        return c

    def raw(self):
        return sqlite3.connect(self.dst_path)


class CopyToTursoStubTest(CopyBase, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = start_stub()

    @classmethod
    def tearDownClass(cls):
        cls.stub.stop()

    def reset_dst(self):
        r = self.stub.raw()
        r.execute("PRAGMA foreign_keys = OFF")
        for (name,) in r.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            r.execute(f"DROP TABLE IF EXISTS {name}")
        r.commit()
        r.close()

    def dst(self):
        c = db_turso.TursoConnection(self.stub.url, self.stub.token)
        c.execute("PRAGMA foreign_keys = ON")
        return c

    def raw(self):
        return self.stub.raw()


class KeyAndCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_key = os.urandom(32)
        self.key_path = os.path.join(self.tmp.name, "secret.key")
        with open(self.key_path, "wb") as f:
            f.write(self.old_key)
        self.src = build_source(self.tmp.name, self.old_key)
        self.new_b64 = base64.b64encode(os.urandom(32)).decode()

    def tearDown(self):
        self.tmp.cleanup()

    def test_bad_new_key_or_old_key_file_refused(self):
        dst = sqlite3.connect(os.path.join(self.tmp.name, "d.db"))
        try:
            with clean_env(), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(ValueError):
                    copy_to_turso.copy(self.src, dst, self.key_path, base64.b64encode(b"short").decode())
                with self.assertRaises(ValueError):
                    copy_to_turso.copy(self.src, dst, self.key_path, "not base64 !!")
                short = os.path.join(self.tmp.name, "short.key")
                with open(short, "wb") as f:
                    f.write(b"x" * 10)
                with self.assertRaises(ValueError):
                    copy_to_turso.copy(self.src, dst, short, self.new_b64)
        finally:
            dst.close()

    def test_missing_source_refused(self):
        dst = sqlite3.connect(os.path.join(self.tmp.name, "d.db"))
        try:
            with clean_env(), self.assertRaises((FileNotFoundError, sqlite3.Error)):
                copy_to_turso.copy(os.path.join(self.tmp.name, "nope.db"), dst, self.key_path, self.new_b64)
        finally:
            dst.close()
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, "nope.db")))

    def test_cli_refuses_when_any_env_missing(self):
        full = {"TURSO_DATABASE_URL": "http://127.0.0.1:9", "TURSO_AUTH_TOKEN": "tok-SECRET-123",
                "GITASAARTHI_MASTER_KEY": self.new_b64}
        argv = ["--src", self.src, "--old-key", self.key_path, "--dry-run"]
        for missing in full:
            with clean_env(), mock.patch.object(copy_to_turso, "copy") as fake, \
                    contextlib.redirect_stderr(io.StringIO()) as err, contextlib.redirect_stdout(io.StringIO()):
                os.environ.update({k: v for k, v in full.items() if k != missing})
                with self.assertRaises(SystemExit) as cm:
                    copy_to_turso.main(argv)
                self.assertNotEqual(cm.exception.code, 0)
                fake.assert_not_called()
                text = str(cm.exception.code) + err.getvalue()
                self.assertIn(missing, text)
                self.assertNotIn("tok-SECRET-123", text)
                self.assertNotIn(self.new_b64, text)

    def test_cli_runs_against_stub(self):
        stub = start_stub()
        try:
            with clean_env(), contextlib.redirect_stdout(io.StringIO()) as out:
                os.environ.update({"TURSO_DATABASE_URL": stub.url, "TURSO_AUTH_TOKEN": stub.token,
                                   "GITASAARTHI_MASTER_KEY": self.new_b64})
                rc = copy_to_turso.main(["--src", self.src, "--old-key", self.key_path])
            self.assertEqual(rc, 0)
            r = stub.raw()
            try:
                self.assertEqual(r.execute("SELECT COUNT(*) FROM users").fetchone()[0], 2)
            finally:
                r.close()
            text = out.getvalue()
            self.assertIn("users", text)
            for s in ("example.com", "scrypt$", stub.token, self.new_b64):
                self.assertNotIn(s, text)
        finally:
            stub.stop()


if __name__ == "__main__":
    unittest.main()
