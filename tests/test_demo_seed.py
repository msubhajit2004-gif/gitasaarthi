"""The demo copy: 50 made-up people with Indian names, plus activity, in a throwaway database. Never the live data."""
import importlib.util
import os
import re
import sqlite3
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

spec = importlib.util.spec_from_file_location("demo", os.path.join(ROOT, "scripts", "demo.py"))
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class DemoSeed(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "demo.db")
        demo.seed(self.db)
        self.conn = sqlite3.connect(self.db)

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def q(self, sql, *a):
        return self.conn.execute(sql, a).fetchall()

    def test_fifty_people_plus_one_admin(self):
        self.assertEqual(self.q("select count(*) from users where role='user'")[0][0], 50)
        self.assertEqual([r[0] for r in self.q("select email from users where role='admin'")], ["admin@example.com"])

    def test_the_names_asked_for_are_there_and_all_are_distinct(self):
        names = [r[0] for r in self.q("select name from users where role='user'")]
        for want in ("Yash Rathore", "Rohan Handa", "Ramanuj Sahu", "Harsh Raj"):
            self.assertIn(want, names)
        self.assertEqual(len(set(names)), 50)

    def test_emails_are_reserved_example_addresses_and_unique(self):
        emails = [r[0] for r in self.q("select email from users")]
        self.assertEqual(len(set(emails)), len(emails))
        for e in emails:
            self.assertTrue(re.fullmatch(r"[a-z0-9.]+@example\.com", e), e)

    def test_everyone_can_sign_in_with_the_documented_password(self):
        for (h,) in self.q("select password_hash from users limit 6"):
            self.assertTrue(server.verify_password(demo.DEMO_PASSWORD, h))

    def test_there_is_activity_over_two_weeks_for_the_charts(self):
        days = {r[0][:10] for r in self.q("select created_at from events where type='conversation'")}
        self.assertGreaterEqual(len(days), 8)
        topics = {r[0] for r in self.q("select distinct topic from events where type='conversation'")}
        self.assertGreaterEqual(len(topics), 6)
        for t in topics:
            self.assertTrue(server.TOPIC_RE.match(t), t)

    def test_a_few_safety_alerts_some_reviewed_some_waiting(self):
        crisis = self.q("select reviewed_at from events where type='crisis_shown'")
        self.assertGreaterEqual(len(crisis), 3)
        self.assertTrue(any(r[0] is None for r in crisis), "at least one waits for review")
        self.assertTrue(any(r[0] is not None for r in crisis), "at least one is already reviewed")

    def test_streaks_and_moods_are_saved_for_most_people(self):
        self.assertGreaterEqual(self.q("select count(distinct user_id) from user_data where key='practice'")[0][0], 35)
        self.assertGreaterEqual(self.q("select count(distinct user_id) from user_data where key='moods'")[0][0], 30)

    def test_running_it_again_replaces_instead_of_duplicating(self):
        demo.seed(self.db)
        conn = sqlite3.connect(self.db)
        self.assertEqual(conn.execute("select count(*) from users").fetchone()[0], 51)
        conn.close()

    def test_it_refuses_to_touch_a_hosted_database(self):
        old = os.environ.get("TURSO_DATABASE_URL")
        os.environ["TURSO_DATABASE_URL"] = "libsql://example.turso.io"
        try:
            with self.assertRaises(SystemExit):
                demo.seed(os.path.join(self.tmp.name, "other.db"))
        finally:
            if old is None:
                os.environ.pop("TURSO_DATABASE_URL", None)
            else:
                os.environ["TURSO_DATABASE_URL"] = old

    def test_nobody_is_active_before_they_joined_and_no_event_predates_its_person(self):
        self.assertEqual(self.q("select count(*) from users where last_active_at < created_at")[0][0], 0)
        self.assertEqual(self.q("select count(*) from events e join users u on u.id=e.user_id where e.created_at < u.created_at")[0][0], 0)

    def test_some_people_have_gone_quiet_this_week_and_most_have_not(self):
        import datetime as d
        cutoff = (d.datetime.now(d.timezone.utc) - d.timedelta(days=7)).isoformat(timespec="seconds")
        active = self.q("select count(*) from users where role='user' and last_active_at >= ?", cutoff)[0][0]
        self.assertTrue(28 <= active <= 46, f"{active} of 50 active in the last 7 days")

    def test_join_times_are_not_all_the_same_time_of_day(self):
        times = {r[0][11:16] for r in self.q("select created_at from users where role='user'")}
        self.assertGreater(len(times), 20)


if __name__ == "__main__":
    unittest.main()
