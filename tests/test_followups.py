"""Follow-up fixes found in review: timezone-safe streaks, IPv6 throttling by network, content-based ETags."""
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402


def at(y, m, d, hh=12):
    return datetime(y, m, d, hh, 0, tzinfo=timezone.utc)


class StreakAcrossTimezones(unittest.TestCase):
    def streak(self, days, now):
        with mock.patch.object(server, "now_utc", return_value=now):
            return server.practice_streak(days)

    def test_same_day_in_utc_still_counts(self):
        self.assertEqual(self.streak(["2026-11-21", "2026-11-20"], at(2026, 11, 21)), 2)

    def test_a_user_ahead_of_utc_overnight_is_not_reset(self):
        # 00:30 on the 22nd in India is still the 21st in UTC; the app stores the user's local date.
        self.assertEqual(self.streak(["2026-11-22", "2026-11-21", "2026-11-20"], at(2026, 11, 21, 19)), 3)

    def test_a_user_behind_utc_is_not_reset(self):
        # evening on the 20th in California is already the 21st in UTC
        self.assertEqual(self.streak(["2026-11-20", "2026-11-19"], at(2026, 11, 21, 3)), 2)

    def test_yesterday_still_keeps_the_streak_alive(self):
        self.assertEqual(self.streak(["2026-11-20", "2026-11-19"], at(2026, 11, 21)), 2)

    def test_a_missed_day_ends_it(self):
        self.assertEqual(self.streak(["2026-11-18", "2026-11-17"], at(2026, 11, 21)), 0)

    def test_dates_far_in_the_future_do_not_count(self):
        self.assertEqual(self.streak(["2030-01-01"], at(2026, 11, 21)), 0)

    def test_junk_is_ignored(self):
        self.assertEqual(self.streak(["x", 5, None, "2026-13-45", "2026-11-21"], at(2026, 11, 21)), 1)
        self.assertEqual(self.streak([], at(2026, 11, 21)), 0)


class ThrottleAddress(unittest.TestCase):
    def test_ipv4_is_unchanged(self):
        self.assertEqual(server.normalize_throttle_ip("203.0.113.9"), "203.0.113.9")

    def test_one_ipv6_network_shares_one_bucket(self):
        a = server.normalize_throttle_ip("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
        b = server.normalize_throttle_ip("2001:db8:1:2:1111:2222:3333:4444")
        self.assertEqual(a, b)
        self.assertNotEqual(a, server.normalize_throttle_ip("2001:db8:1:3::1"))

    def test_ipv4_mapped_ipv6_is_the_ipv4_address(self):
        self.assertEqual(server.normalize_throttle_ip("::ffff:203.0.113.9"), "203.0.113.9")

    def test_anything_else_passes_through(self):
        self.assertEqual(server.normalize_throttle_ip("not-an-ip"), "not-an-ip")
        self.assertEqual(server.normalize_throttle_ip(None), None)


class ContentBasedEtag(unittest.TestCase):
    def test_same_size_edit_with_the_same_timestamp_changes_the_etag(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "app.js")
            with open(p, "wb") as f:
                f.write(b"var a = 1;")
            st = os.stat(p)
            one = server.file_etag(p, st)
            with open(p, "wb") as f:
                f.write(b"var a = 2;")          # same length
            os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns))   # a deploy can leave every mtime identical
            server.clear_etag_cache()                # a new deployment is a new process with an empty cache
            two = server.file_etag(p, os.stat(p))
            self.assertNotEqual(one, two)

    def test_the_file_is_read_once_while_it_is_unchanged(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "site.css")
            with open(p, "wb") as f:
                f.write(b"body{}")
            server.clear_etag_cache()
            with mock.patch("builtins.open", wraps=open) as opened:
                server.file_etag(p, os.stat(p)); server.file_etag(p, os.stat(p)); server.file_etag(p, os.stat(p))
            self.assertEqual(sum(1 for c in opened.call_args_list if c.args and c.args[0] == p), 1)

    def test_a_changed_file_is_read_again(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "site.css")
            with open(p, "wb") as f:
                f.write(b"body{}")
            server.clear_etag_cache()
            one = server.file_etag(p, os.stat(p))
            with open(p, "wb") as f:
                f.write(b"body{color:red}")           # different size, so a different cache key
            self.assertNotEqual(one, server.file_etag(p, os.stat(p)))

    def test_same_content_gives_the_same_etag(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = os.path.join(d, "a.css"), os.path.join(d, "b.css")
            for p in (a, b):
                with open(p, "wb") as f:
                    f.write(b"body{}")
            self.assertEqual(server.file_etag(a, os.stat(a)), server.file_etag(b, os.stat(b)))


class GeminiModelChoice(unittest.TestCase):
    """Found with a real key: gemini-2.5-flash is retired for new keys, and gemini-3.8-flash / gemini-3.5-flash
    did not answer within a minute, while gemini-3-flash-preview and gemini-3.1-flash-lite answer in 2-3 seconds."""

    def test_the_default_is_a_model_that_answers(self):
        self.assertEqual(server.GEMINI_DEFAULT_MODEL, "gemini-3-flash-preview")

    def test_models_that_no_longer_work_map_to_the_default(self):
        for bad in ("gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash"):
            self.assertEqual(server.normalize_gemini_model(bad), server.GEMINI_DEFAULT_MODEL, bad)

    def test_other_models_are_left_alone(self):
        for ok in ("gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-3-flash-preview"):
            self.assertEqual(server.normalize_gemini_model(ok), ok)

    def test_missing_or_empty_means_the_default(self):
        for none in (None, "", "   "):
            self.assertEqual(server.normalize_gemini_model(none), server.GEMINI_DEFAULT_MODEL)


if __name__ == "__main__":
    unittest.main()
