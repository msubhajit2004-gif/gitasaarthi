"""seed_demo_users.py: adds made-up @example.org people to any database, safely, and removes exactly those."""
import contextlib
import importlib.util
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

spec = importlib.util.spec_from_file_location("seed_demo_users", os.path.join(ROOT, "scripts", "seed_demo_users.py"))
sdu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdu)

NO_TURSO = {"TURSO_DATABASE_URL": "", "TURSO_AUTH_TOKEN": ""}


def run(argv, env=None):
    """Run the CLI quietly; returns (summary, printed text). SystemExit propagates."""
    out = io.StringIO()
    with mock.patch.dict(os.environ, env if env is not None else NO_TURSO), contextlib.redirect_stdout(out):
        summary = sdu.main(argv)
    return summary, out.getvalue()


class SeedDemoUsers(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "t.db")
        with mock.patch.dict(os.environ, NO_TURSO):
            server.init_db(self.db)
        c = sqlite3.connect(self.db)
        pw = "x"
        now = "2026-11-01T10:00:00+00:00"
        c.execute("INSERT INTO users (email,name,password_hash,role,created_at,last_active_at) VALUES (?,?,?,?,?,?)",
                  ("admin@example.com", "Admin Real", pw, "admin", now, now))
        c.execute("INSERT INTO users (email,name,password_hash,role,created_at,last_active_at) VALUES (?,?,?,?,?,?)",
                  ("someone@gmail.com", "yash rathore", pw, "user", now, now))   # same name as a demo one, different case
        c.execute("INSERT INTO users (email,name,password_hash,role,created_at,last_active_at) VALUES (?,?,?,?,?,?)",
                  ("test1@example.com", "Test One", pw, "user", now, now))
        c.execute("INSERT INTO users (email,name,password_hash,role,created_at,last_active_at) VALUES (?,?,?,?,?,?)",
                  ("someone.else@gmail.com", "Someone Else", pw, "user", now, now))
        c.execute("INSERT INTO events (user_id,type,topic,created_at) VALUES (2,'conversation','anxiety',?)", (now,))
        c.commit()
        c.close()
        self.before = self.snapshot()

    def tearDown(self):
        self.tmp.cleanup()

    def q(self, sql, *a):
        c = sqlite3.connect(self.db)
        try:
            return c.execute(sql, a).fetchall()
        finally:
            c.close()

    def snapshot(self):
        return self.q("select id,email,name,password_hash,role,created_at,last_active_at from users where id<=4")

    def seed(self, *extra, count=35):
        return run(["--target", "local", "--db", self.db, "--count", str(count), "--seed", "7", *extra])

    def demo_rows(self):
        return self.q("select id,email,name,created_at,last_active_at from users where email like '%@example.org' and id>4")

    def test_adds_exactly_n(self):
        summary, _ = self.seed()
        self.assertEqual(summary["added"], 35)
        self.assertEqual(len(self.demo_rows()), 35)

    def test_can_add_sixty(self):
        self.seed(count=60)
        self.assertEqual(len(self.demo_rows()), 60)

    def test_required_names_present_and_names_distinct_from_everyone(self):
        self.seed()
        names = [r[2] for r in self.demo_rows()]
        for want in ("Yash Rathore", "Rohan Handa", "Ramanuj Sahu", "Harsh Raj"):
            if want.lower() != "yash rathore":   # that name already exists in setUp, so it must be skipped
                self.assertIn(want, names)
        self.assertNotIn("Yash Rathore", names)
        lowered = [n.lower() for n in names]
        self.assertEqual(len(set(lowered)), len(lowered))
        for existing in ("admin real", "yash rathore", "test one", "someone else"):
            self.assertNotIn(existing, lowered)

    def test_four_required_names_when_no_clash(self):
        c = sqlite3.connect(self.db)
        c.execute("DELETE FROM users WHERE id=2")
        c.commit()
        c.close()
        self.seed()
        names = [r[2] for r in self.q("select id,email,name from users where email like '%@example.org'")]
        for want in ("Yash Rathore", "Rohan Handa", "Ramanuj Sahu", "Harsh Raj"):
            self.assertIn(want, names)

    def test_emails_valid_unique_example_org_and_existing_untouched(self):
        self.seed()
        emails = [r[1] for r in self.q("select id,email from users where id>4")]
        self.assertEqual(len(set(emails)), len(emails))
        for e in emails:
            self.assertTrue(re.fullmatch(r"[a-z]+\.[a-z]+[0-9]*@example\.org", e), e)
        self.assertEqual(self.snapshot(), self.before)

    def test_last_active_not_before_created_and_not_future(self):
        self.seed()
        import datetime as d
        now = d.datetime.now(d.timezone.utc).isoformat(timespec="seconds")
        for _id, _e, _n, created, last in self.demo_rows():
            self.assertGreaterEqual(last, created)
            self.assertLessEqual(last, now)
            self.assertLessEqual(created, now)

    def test_joined_within_25_days_with_varied_times(self):
        self.seed()
        import datetime as d
        floor = (d.datetime.now(d.timezone.utc) - d.timedelta(days=26)).isoformat(timespec="seconds")
        created = [r[3] for r in self.demo_rows()]
        self.assertTrue(all(c >= floor for c in created))
        self.assertGreater(len({c[11:16] for c in created}), 15)

    def test_about_a_fifth_are_quiet_this_week(self):
        self.seed(count=60)
        import datetime as d
        cutoff = (d.datetime.now(d.timezone.utc) - d.timedelta(days=7)).isoformat(timespec="seconds")
        quiet = sum(1 for r in self.demo_rows() if r[4] < cutoff)
        self.assertTrue(4 <= quiet <= 22, quiet)

    def test_events_not_before_join_and_topics_valid(self):
        self.seed()
        self.assertEqual(self.q("select count(*) from events e join users u on u.id=e.user_id "
                                "where u.id>4 and e.created_at < u.created_at")[0][0], 0)
        topics = {r[0] for r in self.q("select distinct topic from events where type='conversation' and user_id>4")}
        self.assertGreaterEqual(len(topics), 6)
        for t in topics:
            self.assertTrue(server.TOPIC_RE.match(t), t)
            self.assertIn(t, sdu.TOPICS)

    def test_practice_and_moods_saved_with_local_dates(self):
        self.seed()
        rows = self.q("select key,value,rev from user_data where user_id>4")
        self.assertGreaterEqual(len({1 for k, _, _ in rows if k == "practice"}), 1)
        keys = {k for k, _, _ in rows}
        self.assertEqual(keys, {"practice", "moods"})
        for k, v, rev in rows:
            data = json.loads(v)
            if k == "practice":
                self.assertTrue(all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", x) for x in data))
            else:
                self.assertTrue(all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", x) and 1 <= m <= 5 for x, m in data.items()))
        self.assertGreaterEqual(self.q("select count(distinct user_id) from user_data where key='practice' and user_id>4")[0][0], 28)

    def test_two_crisis_events_one_reviewed_by_first_admin(self):
        self.seed()
        rows = self.q("select reviewed_at,reviewed_by from events where type='crisis_shown' and user_id>4")
        self.assertEqual(len(rows), 2)
        self.assertEqual(sum(1 for r in rows if r[0] is None), 1)
        self.assertEqual([r[1] for r in rows if r[0] is not None], [1])

    def test_crisis_both_unreviewed_without_admin(self):
        c = sqlite3.connect(self.db)
        c.execute("UPDATE users SET role='user' WHERE id=1")
        c.commit()
        c.close()
        self.seed()
        rows = self.q("select reviewed_at from events where type='crisis_shown' and user_id>4")
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r[0] is None for r in rows))

    def test_nobody_can_sign_in_as_a_demo_user_and_the_hash_is_never_printed(self):
        """The demo accounts may sit on a live site: their password is random, never stored or shown, so no one can use them."""
        _, text = self.seed()
        hashes = {r[0] for r in self.q("select password_hash from users where id>4")}
        self.assertEqual(len(hashes), 1)
        h = hashes.pop()
        for guess in ("demo-password-2026", "password", "quiet river 42", "", "example"):
            self.assertFalse(server.verify_password(guess, h), guess)
        self.assertNotIn(h, text)
        self.assertNotIn("scrypt", text)

    def test_the_password_is_different_on_every_run(self):
        self.seed()
        a = {r[0] for r in self.q("select password_hash from users where id>4")}
        other = os.path.join(self.tmp.name, "other.db")
        with mock.patch.dict(os.environ, NO_TURSO):
            server.init_db(other)
        run(["--target", "local", "--db", other, "--count", "5", "--seed", "3"])
        c = sqlite3.connect(other)
        b = {r[0] for r in c.execute("select password_hash from users")}
        c.close()
        self.assertTrue(a and b)
        self.assertTrue(a.isdisjoint(b), "each run must use a fresh random password")

    def test_the_source_has_no_fixed_demo_password(self):
        src = open(os.path.join(ROOT, "scripts", "seed_demo_users.py"), encoding="utf-8").read()
        self.assertNotIn("demo-password-2026", src)

    def test_no_messages_or_journals(self):
        self.seed()
        self.assertEqual(self.q("select count(*) from user_data where key in ('journal','last')")[0][0], 0)

    def test_second_run_is_idempotent(self):
        self.seed()
        summary, _ = self.seed()
        self.assertEqual(summary["added"], 0)
        self.assertEqual(len(self.demo_rows()), 35)

    def test_top_up_to_total(self):
        self.seed(count=20)
        summary, _ = self.seed(count=35)
        self.assertEqual(summary["added"], 15)
        self.assertEqual(len(self.demo_rows()), 35)

    def test_dry_run_writes_nothing(self):
        summary, text = self.seed("--dry-run")
        self.assertEqual(summary["added"], 0)
        self.assertEqual(summary["would_add"], 35)
        self.assertIn("35", text)
        self.assertEqual(len(self.demo_rows()), 0)
        self.assertEqual(self.q("select count(*) from users")[0][0], 4)
        self.assertEqual(self.q("select count(*) from events")[0][0], 1)

    def test_remove_deletes_only_example_org_and_cascades(self):
        self.seed()
        summary, _ = run(["--target", "local", "--db", self.db, "--remove"])
        self.assertEqual(summary["removed"], 35)
        emails = {r[0] for r in self.q("select email from users")}
        self.assertEqual(emails, {"admin@example.com", "someone@gmail.com", "test1@example.com", "someone.else@gmail.com"})
        self.assertEqual(self.q("select count(*) from events where user_id>4")[0][0], 0)
        self.assertEqual(self.q("select count(*) from user_data where user_id>4")[0][0], 0)
        self.assertEqual(self.q("select count(*) from events")[0][0], 1)   # the real user's event stays

    def test_remove_with_no_demo_users_removes_nothing(self):
        summary, _ = run(["--target", "local", "--db", self.db, "--remove"])
        self.assertEqual(summary["removed"], 0)
        self.assertEqual(self.q("select count(*) from users")[0][0], 4)

    def test_email_collision_gets_a_digit_and_existing_row_is_untouched(self):
        c = sqlite3.connect(self.db)
        c.execute("INSERT INTO users (email,name,password_hash,role,created_at) VALUES "
                  "('harsh.raj@example.org','Someone Old','x','user','2026-11-01T10:00:00+00:00')")
        c.commit()
        c.close()
        summary, _ = self.seed()
        self.assertEqual(summary["added"], 34)   # the old @example.org row counts toward the 35
        self.assertEqual(self.q("select name from users where email='harsh.raj@example.org'"), [("Someone Old",)])
        self.assertEqual(self.q("select count(*) from users where email like 'harsh.raj%@example.org'")[0][0], 2)

    def test_foreign_keys_are_on(self):
        conn = server.connect(self.db)
        try:
            self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        finally:
            conn.close()

    def test_live_refuses_without_flag(self):
        env = {"TURSO_DATABASE_URL": "libsql://x.turso.io", "TURSO_AUTH_TOKEN": "t"}
        with self.assertRaises(SystemExit):
            run(["--target", "live", "--count", "35"], env)

    def test_live_refuses_without_env(self):
        with self.assertRaises(SystemExit):
            run(["--target", "live", "--yes-write-production"], NO_TURSO)
        with self.assertRaises(SystemExit):
            run(["--target", "live", "--yes-write-production"], {"TURSO_DATABASE_URL": "libsql://x", "TURSO_AUTH_TOKEN": ""})
        with self.assertRaises(SystemExit):
            run(["--target", "live", "--yes-write-production"], {"TURSO_DATABASE_URL": "", "TURSO_AUTH_TOKEN": "t"})

    def test_live_refusal_connects_to_nothing(self):
        with mock.patch.object(server, "connect", side_effect=AssertionError("must not connect")):
            with self.assertRaises(SystemExit):
                run(["--target", "live"], NO_TURSO)
        self.assertEqual(len(self.demo_rows()), 0)

    def test_local_refuses_when_turso_env_is_set(self):
        env = {"TURSO_DATABASE_URL": "libsql://x.turso.io", "TURSO_AUTH_TOKEN": "t"}
        with self.assertRaises(SystemExit):
            run(["--target", "local", "--db", self.db], env)
        self.assertEqual(len(self.demo_rows()), 0)

    def test_help_says_accounts_are_not_for_signing_in(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            sdu.main(["--help"])
        self.assertIn("not meant", out.getvalue())


if __name__ == "__main__":
    unittest.main()
