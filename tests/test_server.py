"""Server tests: routing gate, accounts, sessions, admin, data, file allowlist.
Run:  python -m unittest tests/test_server.py -v
"""
import http.client
import http.server
import json
import os
import sys
import tempfile
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

# Opt-in: GITASAARTHI_TEST_BACKEND=turso-stub runs this whole suite against a local Turso stub
# (tests/test_turso_adapter.py) instead of SQLite files. No network either way.
_TURSO = {}


def setUpModule():
    # Either way, never follow TURSO_* from the caller's shell (it may point at the live database):
    # the default run uses SQLite temp files, the stub run points them at the local stub.
    _TURSO["old"] = {k: os.environ.pop(k, None) for k in ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN")}
    if os.environ.get("GITASAARTHI_TEST_BACKEND") != "turso-stub":
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from test_turso_adapter import start_stub
    _TURSO["stub"] = stub = start_stub()
    os.environ["TURSO_DATABASE_URL"], os.environ["TURSO_AUTH_TOKEN"] = stub.url, stub.token


def reset_stub_throttle():
    """Test isolation for the turso stub only: every class shares its one store and every request comes
    from 127.0.0.1, so persisted signup/login counts would otherwise add up across classes. SQLite runs
    give each class its own database file, so nothing to do there."""
    if "stub" not in _TURSO:
        return
    conn = server.connect("")
    try:
        conn.execute("DELETE FROM throttle_events")
        conn.commit()
    finally:
        conn.close()


def tearDownModule():
    for k, v in _TURSO.pop("old", {}).items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    if "stub" in _TURSO:
        _TURSO.pop("stub").stop()


class Client:
    def __init__(self, port):
        self.port = port
        self.cookie = None

    def req(self, method, path, body=None, headers=None, json_body=True, origin=True):
        h = dict(headers or {})
        if self.cookie:
            h["Cookie"] = self.cookie
        data = None
        if body is not None:
            data = json.dumps(body).encode() if json_body else body.encode()
            h.setdefault("Content-Type", "application/json" if json_body else "text/plain")
        if origin and method in ("POST", "PUT", "PATCH", "DELETE"):
            h.setdefault("Origin", f"http://localhost:{self.port}")
        h.setdefault("Host", f"localhost:{self.port}")
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        raw = r.read()
        sc = r.getheader("Set-Cookie")
        if sc and sc.startswith("gs_session="):
            val = sc.split(";", 1)[0]
            self.cookie = None if val == "gs_session=" else val
        c.close()
        try:
            payload = json.loads(raw) if raw and r.getheader("Content-Type", "").startswith("application/json") else raw
        except ValueError:
            payload = raw
        return r.status, r.getheader("Location"), payload


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = os.path.join(cls.tmp.name, "test.db")
        cls.httpd = server.build_server(0, cls.db)
        reset_stub_throttle()
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def client(self):
        return Client(self.port)

    def signup(self, email, name="Asha", pw="correct horse"):
        c = self.client()
        st, _, body = c.req("POST", "/api/signup", {"name": name, "email": email, "password": pw})
        self.assertEqual(st, 201, body)
        return c

    # ---- routing and the gate
    def test_root_logged_out_is_sign_in(self):
        st, loc, _ = self.client().req("GET", "/")
        self.assertEqual((st, loc), (302, "/login.html"))
        st, _, _ = self.client().req("GET", "/landing.html")
        self.assertEqual(st, 404)

    def test_app_requires_sign_in(self):
        st, loc, _ = self.client().req("GET", "/index.html")
        self.assertEqual(st, 302)
        self.assertEqual(loc, "/login.html?next=%2Findex.html")
        st, loc, _ = self.client().req("GET", "/dashboard.html")
        self.assertEqual(st, 302)

    def test_public_pages(self):
        for p in ("/login.html", "/safe-harbor.html", "/css/site.css", "/js/site.js"):
            st, _, _ = self.client().req("GET", p)
            self.assertEqual(st, 200, p)

    def test_csrf_refusal_with_a_body_is_a_clean_403(self):
        """The refusal must read the body first: closing with it unread resets the connection on Windows,
        so the client sees an abort instead of the 403."""
        body = json.dumps({"email": "x@example.com", "password": "p" * 400_000})
        for _ in range(5):
            st, _, _ = self.client().req("POST", "/api/login", body, json_body=False, origin=False)
            self.assertEqual(st, 403)

    def test_csp_script_src_has_no_unsafe_inline(self):
        c = http.client.HTTPConnection("127.0.0.1", self.client().port, timeout=10)
        c.request("GET", "/login.html", headers={"Host": f"localhost:{self.client().port}"})
        r = c.getresponse()
        r.read()
        csp = r.getheader("Content-Security-Policy") or ""
        c.close()
        script_src = [d.strip() for d in csp.split(";") if d.strip().startswith("script-src")]
        self.assertEqual(script_src, ["script-src 'self'"])
        self.assertNotIn("unsafe-inline", script_src[0])

    def test_private_files_are_not_served(self):
        for p in ("/server.py", "/app.py", "/venv/pyvenv.cfg", "/data/gitasaarthi.db", "/.backup-before-unslop/",
                  "/README.md", "/tests/test_server.py", "/css/../server.py", "/%2e%2e/server.py"):
            st, _, _ = self.client().req("GET", p)
            self.assertEqual(st, 404, p)

    def test_signup_opens_app_and_root_goes_to_dashboard(self):
        c = self.signup("gate@example.com")
        self.assertTrue(c.cookie)
        st, _, _ = c.req("GET", "/index.html")
        self.assertEqual(st, 200)
        st, loc, _ = c.req("GET", "/")
        self.assertEqual((st, loc), (302, "/dashboard.html"))
        st, _, me = c.req("GET", "/api/me")
        self.assertEqual(st, 200)
        self.assertEqual(me["email"], "gate@example.com")
        self.assertEqual(me["role"], "user")
        self.assertNotIn("password_hash", me)

    # ---- accounts
    def test_signup_validation_and_duplicate(self):
        c = self.client()
        st, _, _ = c.req("POST", "/api/signup", {"name": "A", "email": "bad", "password": "longenough"})
        self.assertEqual(st, 400)
        st, _, _ = c.req("POST", "/api/signup", {"name": "A", "email": "a@b.co", "password": "short"})
        self.assertEqual(st, 400)
        self.signup("dup@example.com")
        st, _, _ = self.client().req("POST", "/api/signup", {"name": "B", "email": "DUP@example.com", "password": "longenough"})
        self.assertEqual(st, 409)

    def test_login_wrong_password_is_generic_and_throttled(self):
        self.signup("throttle@example.com", pw="the right one")
        msgs = set()
        for _ in range(5):
            st, _, body = self.client().req("POST", "/api/login", {"email": "throttle@example.com", "password": "nope nope"})
            self.assertEqual(st, 401)
            msgs.add(body["error"])
        st, _, body = self.client().req("POST", "/api/login", {"email": "nobody@example.com", "password": "nope nope"})
        msgs.add(body["error"])
        self.assertEqual(len(msgs), 1, "unknown email and wrong password must read the same")
        st, _, _ = self.client().req("POST", "/api/login", {"email": "throttle@example.com", "password": "the right one"})
        self.assertEqual(st, 429)

    def test_login_and_logout_kills_session(self):
        self.signup("out@example.com", pw="password one")
        c = self.client()
        st, _, _ = c.req("POST", "/api/login", {"email": "out@example.com", "password": "password one"})
        self.assertEqual(st, 200)
        old = c.cookie
        st, _, _ = c.req("POST", "/api/logout", {})
        self.assertEqual(st, 200)
        c.cookie = old  # replay the old cookie
        st, _, _ = c.req("GET", "/index.html")
        self.assertEqual(st, 302)
        st, _, _ = c.req("GET", "/api/me")
        self.assertEqual(st, 401)

    def test_csrf_needs_json_and_same_origin(self):
        c = self.client()
        st, _, _ = c.req("POST", "/api/signup", "name=x", json_body=False)
        self.assertEqual(st, 403)
        st, _, _ = c.req("POST", "/api/signup", {"name": "x", "email": "x@y.co", "password": "longenough"},
                         headers={"Origin": "http://evil.example"})
        self.assertEqual(st, 403)

    def test_next_must_be_local(self):
        st, _, body = self.client().req("GET", "/login.html")
        self.assertEqual(st, 200)
        self.assertEqual(server.safe_next("//evil.com/x"), "/dashboard.html")
        self.assertEqual(server.safe_next("https://evil.com"), "/dashboard.html")
        self.assertEqual(server.safe_next("/\\evil.com"), "/dashboard.html")
        self.assertEqual(server.safe_next("/index.html"), "/index.html")

    # ---- per-user data
    def test_user_data_round_trip_and_isolation(self):
        a = self.signup("data-a@example.com")
        b = self.signup("data-b@example.com")
        st, _, _ = a.req("PUT", "/api/me/data/practice", {"value": ["2026-11-20"]})
        self.assertEqual(st, 200)
        st, _, got = a.req("GET", "/api/me/data")
        self.assertEqual(got["practice"], ["2026-11-20"])
        st, _, got = b.req("GET", "/api/me/data")
        self.assertNotIn("practice", got)
        st, _, _ = a.req("PUT", "/api/me/data/password_hash", {"value": "x"})
        self.assertEqual(st, 400)
        st, _, _ = self.client().req("PUT", "/api/me/data/practice", {"value": []})
        self.assertEqual(st, 401)

    def test_body_limit(self):
        a = self.signup("big@example.com")
        st, _, _ = a.req("PUT", "/api/me/data/journal", {"value": "x" * 600000})
        self.assertEqual(st, 413)

    # ---- admin
    def test_admin_is_role_checked_on_every_request(self):
        u = self.signup("plain@example.com")
        st, _, _ = u.req("GET", "/admin.html")
        self.assertEqual(st, 403)
        st, _, _ = u.req("GET", "/api/admin/stats")
        self.assertEqual(st, 403)
        server.set_role(self.db, "plain@example.com", "admin")
        st, _, _ = u.req("GET", "/admin.html")
        self.assertEqual(st, 200)
        st, _, stats = u.req("GET", "/api/admin/stats")
        self.assertEqual(st, 200)
        self.assertIn("users", stats)
        server.set_role(self.db, "plain@example.com", "user")
        st, _, _ = u.req("GET", "/api/admin/stats")
        self.assertEqual(st, 403)

    def test_events_and_review(self):
        u = self.signup("events@example.com")
        st, _, _ = u.req("POST", "/api/events", {"type": "conversation", "topic": "anxiety"})
        self.assertEqual(st, 201)
        st, _, _ = u.req("POST", "/api/events", {"type": "crisis_shown"})
        self.assertEqual(st, 201)
        st, _, _ = u.req("POST", "/api/events", {"type": "anything_else"})
        self.assertEqual(st, 400)
        admin = self.signup("boss@example.com")
        server.set_role(self.db, "boss@example.com", "admin")
        st, _, rows = admin.req("GET", "/api/admin/reviews")
        mine = [r for r in rows["reviews"] if r["email"] == "events@example.com"]
        self.assertEqual(len(mine), 1)
        self.assertFalse(mine[0]["reviewed"])
        st, _, _ = admin.req("POST", f"/api/admin/reviews/{mine[0]['id']}", {})
        self.assertEqual(st, 200)
        st, _, rows = admin.req("GET", "/api/admin/reviews")
        self.assertTrue([r for r in rows["reviews"] if r["id"] == mine[0]["id"]][0]["reviewed"])
        st, _, users = admin.req("GET", "/api/admin/users?q=events")
        self.assertEqual([x["email"] for x in users["users"]], ["events@example.com"])

    # ---- hardening (package A)
    def raw(self, request_bytes):
        import socket
        s = socket.create_connection(("127.0.0.1", self.port), timeout=10)
        s.sendall(request_bytes)
        data = b""
        while True:
            try:
                chunk = s.recv(65536)
            except socket.timeout:
                break
            if not chunk:
                break
            data += chunk
        s.close()
        return data

    def capture_stderr(self):
        import io
        from unittest import mock
        buf = io.StringIO()
        return buf, mock.patch.object(sys, "stderr", buf)

    def test_bad_content_length(self):
        for cl, want in ((b"abc", b" 400 "), (b"-5", b" 400 "), (b"9999999", b" 413 ")):
            req = (b"POST /api/login HTTP/1.1\r\nHost: localhost:%d\r\nOrigin: http://localhost:%d\r\n"
                   b"Content-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n{}") % (
                self.port, self.port, cl)
            self.assertIn(want, self.raw(req).split(b"\r\n", 1)[0] + b" ", cl)
        self.assertEqual(server.Handler.timeout, 15)

    def test_bad_cookie_is_signed_out_not_500(self):
        for val in ("gs_session=caf\xe9", "gs_session=" + "a" * 5000):
            c = self.client()
            st, _, _ = c.req("GET", "/api/me", headers={"Cookie": val})
            self.assertEqual(st, 401, val[:20])
            st, loc, _ = c.req("GET", "/dashboard.html", headers={"Cookie": val})
            self.assertEqual(st, 302)

    def test_signup_type_and_encoding_validation(self):
        c = self.client()
        hdr = {"Content-Type": "application/json"}
        for body in ({"name": 5, "email": "t1@example.com", "password": "longenough"},
                     {"name": "A", "email": ["x@y.co"], "password": "longenough"},
                     {"name": "A", "email": "t2@example.com", "password": 12345678}):
            st, _, _ = c.req("POST", "/api/signup", body)
            self.assertEqual(st, 400, body)
        for raw in ('{"name": "\\ud800", "email": "t3@example.com", "password": "longenough"}',
                    '{"name": "A", "email": "t4@example.com", "password": "longenough\\udc00"}'):
            st, _, _ = c.req("POST", "/api/signup", raw, headers=hdr, json_body=False)
            self.assertEqual(st, 400, raw)

    def test_data_shape_and_nan(self):
        a = self.signup("shape@example.com")
        ok = {"practice": ["2026-01-01"], "moods": {"a": 1}, "journal": [{"t": 1}], "last": {"x": 1}}
        for k, v in ok.items():
            st, _, _ = a.req("PUT", f"/api/me/data/{k}", {"value": v})
            self.assertEqual(st, 200, k)
        bad = {"practice": [1, 2], "moods": [], "journal": {}, "last": []}
        for k, v in bad.items():
            st, _, _ = a.req("PUT", f"/api/me/data/{k}", {"value": v})
            self.assertEqual(st, 400, k)
        st, _, _ = a.req("PUT", "/api/me/data/moods", '{"value": {"a": NaN}}',
                         headers={"Content-Type": "application/json"}, json_body=False)
        self.assertEqual(st, 400)

    def test_get_data_skips_corrupt_rows(self):
        a = self.signup("corrupt@example.com")
        a.req("PUT", "/api/me/data/last", {"value": {"x": 1}})
        conn = server.connect(self.db)
        uid = conn.execute("SELECT id FROM users WHERE email='corrupt@example.com'").fetchone()[0]
        conn.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, 'moods', '{bad', 'x')", (uid,))
        conn.commit()
        conn.close()
        st, _, got = a.req("GET", "/api/me/data")
        self.assertEqual(st, 200)
        got.pop("_rev", None)
        self.assertEqual(got, {"last": {"x": 1}})

    def test_throttle_unit(self):
        t = server.Throttle()
        for _ in range(server.LOGIN_MAX_PER_ACCOUNT):
            self.assertTrue(t.reserve("a@b.co", "1.1.1.1"))
        self.assertFalse(t.reserve("a@b.co", "1.1.1.1"))
        t.release("a@b.co", "1.1.1.1")
        self.assertTrue(t.reserve("a@b.co", "1.1.1.1"))
        t2 = server.Throttle()
        t2.reserve("x" * 1000, "1.1.1.1")
        self.assertTrue(all(len(k) <= 254 + 5 for k in t2.fails))
        for i in range(server.Throttle.MAX_KEYS + 50):
            t2.reserve(f"u{i}@x.co", "2.2.2.2")
        self.assertLessEqual(len(t2.fails), server.Throttle.MAX_KEYS + 2)
        t3 = server.Throttle()
        for _ in range(server.SIGNUP_MAX_PER_IP):
            self.assertTrue(t3.reserve_signup("3.3.3.3"))
        self.assertFalse(t3.reserve_signup("3.3.3.3"))
        self.assertTrue(t3.reserve_signup("4.4.4.4"))

    def test_hash_semaphore(self):
        self.assertIsInstance(server.HASH_SEM, type(threading.BoundedSemaphore()))

    def test_bind_default_and_warning(self):
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")
        self.assertEqual(server.DEFAULT_HOST, os.environ.get("GITASAARTHI_HOST", "127.0.0.1"))
        self.assertIsNone(server.bind_warning("127.0.0.1", False))
        self.assertIsNone(server.bind_warning("0.0.0.0", True))
        self.assertIn("GITASAARTHI_SECURE_COOKIE", server.bind_warning("0.0.0.0", False))

    def test_client_ip_proxy_header_ignored_by_default(self):
        self.assertFalse(server.TRUST_PROXY)
        self.assertEqual(server.pick_client_ip("10.0.0.1", "9.9.9.9, 8.8.8.8", False), "10.0.0.1")
        self.assertEqual(server.pick_client_ip("10.0.0.1", None, True), "10.0.0.1")

    def test_client_ip_uses_rightmost_forwarded_entry(self):
        # a client can prepend anything; only the entry our own proxy appended (rightmost) is believable
        self.assertEqual(server.pick_client_ip("10.0.0.1", "6.6.6.6, 9.9.9.9, 8.8.8.8", True), "8.8.8.8")
        self.assertEqual(server.pick_client_ip("10.0.0.1", "6.6.6.6, 2001:db8::1", True), "2001:db8::1")
        self.assertEqual(server.pick_client_ip("10.0.0.1", "9.9.9.9, not-an-ip", True), "10.0.0.1")
        self.assertEqual(server.pick_client_ip("10.0.0.1", "", True), "10.0.0.1")
        self.assertEqual(server.pick_client_ip("10.0.0.1", "6.6.6.6, 9.9.9.9", False), "10.0.0.1")

    def test_reviews_unreviewed_first_with_counts(self):
        old = self.signup("oldcrisis@example.com")
        old.req("POST", "/api/events", {"type": "crisis_shown"})
        admin = self.make_admin("order-admin@example.com")
        rows = admin.req("GET", "/api/admin/reviews?limit=100")[2]["reviews"]
        old_id = [r for r in rows if r["email"] == "oldcrisis@example.com"][0]["id"]
        conn = server.connect(self.db)
        conn.execute("UPDATE events SET created_at = '2000-01-01T00:00:00Z' WHERE id = ?", (old_id,))
        conn.commit(); conn.close()
        for i in range(2):
            n = self.signup(f"newer{i}@example.com")
            n.req("POST", "/api/events", {"type": "crisis_shown"})
        rows = admin.req("GET", "/api/admin/reviews?limit=100")[2]["reviews"]
        for r in rows:
            if r["email"].startswith("newer"):
                admin.req("POST", f"/api/admin/reviews/{r['id']}", {})
        st, _, data = admin.req("GET", "/api/admin/reviews?limit=100")
        ids = [r["id"] for r in data["reviews"]]
        first_reviewed = next(i for i, r in enumerate(data["reviews"]) if r["reviewed"])
        self.assertLess(ids.index(old_id), first_reviewed)
        self.assertEqual(data["total"], len(data["reviews"]))
        self.assertEqual(data["unreviewed"], len([r for r in data["reviews"] if not r["reviewed"]]))
        self.assertGreaterEqual(data["unreviewed"], 1)

    def test_purge_and_session_cap(self):
        self.signup("cap@example.com", pw="password one")
        conn = server.connect(self.db)
        uid = conn.execute("SELECT id FROM users WHERE email='cap@example.com'").fetchone()[0]
        conn.execute("INSERT INTO sessions VALUES ('dead', ?, 'x', 'x', '2000-01-01T00:00:00+00:00')", (uid,))
        conn.commit()
        conn.close()
        server.purge_expired_sessions(self.db)
        conn = server.connect(self.db)
        self.assertIsNone(conn.execute("SELECT 1 FROM sessions WHERE token_hash='dead'").fetchone())
        conn.close()
        for _ in range(12):
            st, _, _ = self.client().req("POST", "/api/login", {"email": "cap@example.com", "password": "password one"})
            self.assertEqual(st, 200)
        conn = server.connect(self.db)
        n = conn.execute("SELECT COUNT(*) FROM sessions WHERE user_id=?", (uid,)).fetchone()[0]
        conn.close()
        self.assertEqual(n, server.MAX_SESSIONS_PER_USER)

    def test_revoke_other_sessions(self):
        a = self.signup("rev@example.com", pw="password one")
        b = self.client()
        b.req("POST", "/api/login", {"email": "rev@example.com", "password": "password one"})
        st, _, _ = a.req("POST", "/api/me/sessions/revoke", {})
        self.assertEqual(st, 200)
        self.assertEqual(a.req("GET", "/api/me")[0], 200)
        self.assertEqual(b.req("GET", "/api/me")[0], 401)

    def test_delete_account(self):
        a = self.signup("gone@example.com", pw="password one")
        a.req("PUT", "/api/me/data/last", {"value": {"x": 1}})
        old = a.cookie
        st, _, body = a.req("DELETE", "/api/me", {"password": "wrong wrong"})
        self.assertEqual(st, 403)
        self.assertEqual(a.req("GET", "/api/me")[0], 200)
        st, _, _ = a.req("DELETE", "/api/me", {"password": "password one"})
        self.assertEqual(st, 200)
        self.assertIsNone(a.cookie)
        a.cookie = old
        self.assertEqual(a.req("GET", "/api/me")[0], 401)
        st, _, _ = self.client().req("POST", "/api/login", {"email": "gone@example.com", "password": "password one"})
        self.assertEqual(st, 401)
        conn = server.connect(self.db)
        self.assertEqual(conn.execute(
            "SELECT COUNT(*) FROM user_data WHERE user_id NOT IN (SELECT id FROM users)").fetchone()[0], 0)
        conn.close()

    def make_admin(self, email):
        c = self.signup(email)
        server.set_role(self.db, email, "admin")
        return c

    def test_admin_pagination(self):
        admin = self.make_admin("pager@example.com")
        st, _, r = admin.req("GET", "/api/admin/users?limit=2")
        self.assertEqual((st, len(r["users"])), (200, 2))
        st, _, r2 = admin.req("GET", "/api/admin/users?limit=2&offset=2")
        self.assertNotEqual([u["id"] for u in r["users"]], [u["id"] for u in r2["users"]])
        st, _, r3 = admin.req("GET", "/api/admin/users?limit=100000")
        self.assertLessEqual(len(r3["users"]), 100)
        self.assertEqual(admin.req("GET", "/api/admin/users?limit=abc")[0], 400)
        st, _, rv = admin.req("GET", "/api/admin/reviews?limit=1&offset=0")
        self.assertEqual(st, 200)
        self.assertLessEqual(len(rv["reviews"]), 1)

    def test_review_is_idempotent(self):
        u = self.signup("idem@example.com")
        u.req("POST", "/api/events", {"type": "crisis_shown"})
        a1 = self.make_admin("idem-a1@example.com")
        a2 = self.make_admin("idem-a2@example.com")
        rows = a1.req("GET", "/api/admin/reviews?limit=100")[2]["reviews"]
        eid = [r for r in rows if r["email"] == "idem@example.com"][0]["id"]
        self.assertEqual(a1.req("POST", f"/api/admin/reviews/{eid}", {})[0], 200)
        conn = server.connect(self.db)
        first = conn.execute("SELECT reviewed_at, reviewed_by FROM events WHERE id=?", (eid,)).fetchone()
        self.assertEqual(a2.req("POST", f"/api/admin/reviews/{eid}", {})[0], 200)
        second = conn.execute("SELECT reviewed_at, reviewed_by FROM events WHERE id=?", (eid,)).fetchone()
        conn.close()
        self.assertEqual(tuple(first), tuple(second))
        self.assertEqual(a1.req("POST", "/api/admin/reviews/99999999", {})[0], 404)

    def test_error_codes(self):
        st, _, b = self.client().req("GET", "/api/me")
        self.assertEqual((st, b["code"]), (401, "unauthorized"))
        self.assertIn("error", b)
        u = self.signup("codes@example.com")
        self.assertEqual(u.req("GET", "/api/admin/stats")[2]["code"], "forbidden")
        self.assertEqual(u.req("GET", "/api/nope")[2]["code"], "not_found")
        self.assertEqual(u.req("PUT", "/api/me/data/practice", {"value": "x" * 600000})[2]["code"], "too_large")
        self.assertEqual(u.req("PUT", "/api/me/data/zzz", {"value": 1})[2]["code"], "bad_request")

    def test_500_logs_traceback_and_has_code(self):
        from unittest import mock
        u = self.signup("boom@example.com")
        buf, p = self.capture_stderr()
        with p, mock.patch.object(server.Handler, "api_event", side_effect=RuntimeError("boom")):
            st, _, b = u.req("POST", "/api/events", {"type": "conversation"})
        self.assertEqual((st, b["code"]), (500, "server_error"))
        self.assertIn("Traceback", buf.getvalue())
        self.assertNotIn("Traceback", json.dumps(b))

    def test_audit_has_ip_and_query_not_logged(self):
        buf, p = self.capture_stderr()
        with p:
            self.client().req("POST", "/api/login", {"email": "ipcheck@example.com", "password": "nope nope"})
            admin = self.make_admin("logq@example.com")
            admin.req("GET", "/api/admin/users?q=secretterm")
        out = buf.getvalue()
        self.assertIn("ip=127.0.0.1", out)
        self.assertIn("/api/admin/users", out)
        self.assertNotIn("secretterm", out)

    def raw_headers(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("GET", path, headers=headers or {})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def test_security_headers_and_healthz(self):
        r, body = self.raw_headers("/healthz")
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(body), {"ok": True})
        for path in ("/healthz", "/login.html", "/api/me"):
            r, _ = self.raw_headers(path)
            csp = r.getheader("Content-Security-Policy")
            self.assertIn("default-src 'self'", csp)
            self.assertIn("frame-ancestors 'none'", csp)
            self.assertNotIn("generativelanguage.googleapis.com", csp)
            self.assertEqual(r.getheader("Permissions-Policy"), "microphone=(self)")

    def test_user_version_and_backup(self):
        conn = server.connect(self.db)
        self.assertEqual(conn.execute("PRAGMA user_version").fetchone()[0], 2)
        conn.close()
        dest = os.path.join(self.tmp.name, "backup.db")
        server.backup_db(self.db, dest)
        conn = server.connect(dest)
        self.assertGreater(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0], 0)
        conn.close()

    def test_sigterm_handler_installed(self):
        import signal
        old = signal.getsignal(signal.SIGTERM)
        try:
            server.install_sigterm(self.httpd)
            self.assertTrue(callable(signal.getsignal(signal.SIGTERM)))
            self.assertNotEqual(signal.getsignal(signal.SIGTERM), old)
        finally:
            signal.signal(signal.SIGTERM, old)

    def test_static_etag_and_html_no_store(self):
        r, body = self.raw_headers("/css/site.css")
        etag = r.getheader("ETag")
        self.assertTrue(etag)
        self.assertEqual(r.getheader("Cache-Control"), "no-cache")
        r, body = self.raw_headers("/css/site.css", {"If-None-Match": etag})
        self.assertEqual((r.status, body), (304, b""))
        r, _ = self.raw_headers("/login.html")
        self.assertIn("no-store", r.getheader("Cache-Control"))
        self.assertFalse(r.getheader("ETag"))
        r, _ = self.raw_headers("/api/me")
        self.assertIn("no-store", r.getheader("Cache-Control"))

    def test_audio_range(self):
        # A throwaway file stands in for audio: the repository ships no recordings of its own.
        audio_dir = os.path.join(server.DIRECTORY, "audio")
        made_dir = not os.path.isdir(audio_dir)
        os.makedirs(audio_dir, exist_ok=True)
        probe = os.path.join(audio_dir, "range-test.webm")
        with open(probe, "wb") as f:
            f.write(bytes(range(256)) * 8)
        try:
            r, body = self.raw_headers("/audio/range-test.webm", {"Range": "bytes=0-99"})
            self.assertEqual(r.status, 206)
            self.assertEqual(len(body), 100)
            self.assertTrue(r.getheader("Content-Range").startswith("bytes 0-99/"))
            self.assertEqual(r.getheader("Accept-Ranges"), "bytes")
            r, body = self.raw_headers("/audio/range-test.webm", {"Range": "bytes=-10"})
            self.assertEqual((r.status, len(body)), (206, 10))
            r, _ = self.raw_headers("/audio/range-test.webm", {"Range": "bytes=999999999-"})
            self.assertEqual(r.status, 416)
            r, body = self.raw_headers("/audio/range-test.webm")
            self.assertEqual(r.status, 200)
            self.assertEqual(r.getheader("Accept-Ranges"), "bytes")
        finally:
            # On Windows the server thread can still hold the file for a moment after the last response
            for attempt in range(40):
                try:
                    os.remove(probe)
                    break
                except PermissionError:
                    if attempt == 39:
                        raise
                    time.sleep(0.05)
            if made_dir:
                os.rmdir(audio_dir)

    def test_cli_honours_db(self):
        db = os.path.join(self.tmp.name, "cli.db")
        server.init_db(db)
        conn = server.connect(db)
        conn.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES ('c@x.co','C','x','now')")
        conn.commit()
        conn.close()
        server.cli_make_admin("c@x.co", db)
        conn = server.connect(db)
        self.assertEqual(conn.execute("SELECT role FROM users WHERE email='c@x.co'").fetchone()[0], "admin")
        conn.close()


    # ---- rename
    def test_rename_me(self):
        a = self.signup("rn1@example.com", name="Asha")
        other = self.signup("rn2@example.com", name="Ravi")
        st, _, body = a.req("PATCH", "/api/me", {"name": "  Subha  "})
        self.assertEqual(st, 200, body)
        self.assertEqual((body["name"], body["email"]), ("Subha", "rn1@example.com"))
        self.assertEqual(a.req("GET", "/api/me")[2], body)
        self.assertEqual(other.req("GET", "/api/me")[2]["name"], "Ravi")

    def test_rename_rejects_bad_names(self):
        a = self.signup("rn3@example.com")
        for bad in ("", "   ", "x" * 61, 5, None, ["a"], "bad\x07name", "line\nbreak"):
            st, _, _ = a.req("PATCH", "/api/me", {"name": bad})
            self.assertEqual(st, 400, repr(bad))
        st, _, _ = a.req("PATCH", "/api/me", {})
        self.assertEqual(st, 400)
        self.assertEqual(a.req("GET", "/api/me")[2]["name"], "Asha")
        self.assertEqual(a.req("PATCH", "/api/me", {"name": "x" * 60})[0], 200)

    def test_rename_needs_session_and_csrf(self):
        self.assertEqual(self.client().req("PATCH", "/api/me", {"name": "Zed"})[0], 401)
        a = self.signup("rn4@example.com")
        self.assertEqual(a.req("PATCH", "/api/me", {"name": "Zed"}, origin=False)[0], 403)

    # ---- password change, privacy, error pages, favicon
    def test_change_password(self):
        a = self.signup("pw1@example.com")
        b = self.client()
        st, _, _ = b.req("POST", "/api/login", {"email": "pw1@example.com", "password": "correct horse"})
        self.assertEqual(st, 200)
        st, _, body = a.req("POST", "/api/me/password", {"current": "correct horse", "new": "brand new pass"})
        self.assertEqual((st, body), (200, {"ok": True}))
        self.assertEqual(a.req("GET", "/api/me")[0], 200)   # current session kept
        self.assertEqual(b.req("GET", "/api/me")[0], 401)   # other session revoked
        self.assertEqual(self.client().req("POST", "/api/login", {"email": "pw1@example.com", "password": "correct horse"})[0], 401)
        self.assertEqual(self.client().req("POST", "/api/login", {"email": "pw1@example.com", "password": "brand new pass"})[0], 200)

    def test_change_password_wrong_current_and_weak_new(self):
        a = self.signup("pw2@example.com")
        st, _, body = a.req("POST", "/api/me/password", {"current": "nope nope nope", "new": "brand new pass"})
        self.assertEqual((st, body["code"]), (403, "forbidden"))
        for bad in ("short", "x" * 201, 12345678, None):
            st, _, _ = a.req("POST", "/api/me/password", {"current": "correct horse", "new": bad})
            self.assertEqual(st, 400, bad)
        self.assertEqual(self.client().req("POST", "/api/login", {"email": "pw2@example.com", "password": "correct horse"})[0], 200)

    def test_change_password_needs_session_and_csrf(self):
        st, _, _ = self.client().req("POST", "/api/me/password", {"current": "a", "new": "b" * 8})
        self.assertEqual(st, 401)
        a = self.signup("pw3@example.com")
        st, _, _ = a.req("POST", "/api/me/password", {"current": "correct horse", "new": "brand new pass"}, origin=False)
        self.assertEqual(st, 403)

    def test_privacy_page_public(self):
        st, _, body = self.client().req("GET", "/privacy.html")
        self.assertEqual(st, 200)
        self.assertIn(b"Privacy", body)

    def test_html_error_pages(self):
        st, _, body = self.client().req("GET", "/nope.html", headers={"Accept": "text/html"})
        self.assertEqual(st, 404)
        self.assertIn(b"<html", body)
        st, _, body = self.signup("err404@example.com").req("GET", "/api/nope")
        self.assertEqual(st, 404)
        self.assertEqual(body["code"], "not_found")
        st, _, _ = self.client().req("GET", "/404.html")
        self.assertEqual(st, 404)   # not a direct route
        st, _, _ = self.client().req("GET", "/500.html")
        self.assertEqual(st, 404)

    def test_favicon(self):
        st, _, body = self.client().req("GET", "/favicon.ico")
        self.assertEqual(st, 200)
        self.assertIn(b"<svg", body)
        st, _, _ = self.client().req("GET", "/images/favicon.svg")
        self.assertEqual(st, 200)


GOOD_KEY = "AIzaSyTESTKEY_0123456789abcdefghij"
CANNED = {"candidates": [{"content": {"parts": [{"text": "OK"}], "role": "model"}}]}


class StubGoogle(http.server.BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        b = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _auth(self):
        if self.headers.get("x-goog-api-key") != GOOD_KEY or GOOD_KEY in self.path:
            self._send(400, {"error": {"message": "API key not valid. Please pass a valid API key. " + GOOD_KEY}})
            return False
        return True

    def do_GET(self):
        if not self._auth():
            return
        self._send(200, {"models": [
            {"name": "models/gemini-3.8-flash", "displayName": "Gemini 3.8 Flash",
             "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding-001", "displayName": "Embed",
             "supportedGenerationMethods": ["embedContent"]}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        StubGoogle.seen.append((self.path, body))
        if not self._auth():
            return
        if "/models/nope:generateContent" in self.path:
            self._send(404, {"error": {"message": "models/nope is not found", "status": "NOT_FOUND"}})
            return
        self._send(200, CANNED)


class GeminiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.stub = http.server.ThreadingHTTPServer(("127.0.0.1", 0), StubGoogle)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        cls.old_env = {k: os.environ.get(k) for k in ("GITASAARTHI_GEMINI_BASE", "GITASAARTHI_SECRET_KEY_FILE")}
        cls.old_base = server.GEMINI_BASE
        base = f"http://127.0.0.1:{cls.stub.server_address[1]}"
        os.environ["GITASAARTHI_GEMINI_BASE"] = base
        server.GEMINI_BASE = base
        os.environ["GITASAARTHI_SECRET_KEY_FILE"] = os.path.join(cls.tmp.name, "secret.key")
        cls.db = os.path.join(cls.tmp.name, "g.db")
        cls.httpd = server.build_server(0, cls.db)
        reset_stub_throttle()
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.stub.shutdown()
        cls.stub.server_close()
        server.GEMINI_BASE = cls.old_base
        for k, v in cls.old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        cls.tmp.cleanup()

    def user(self, email):
        c = Client(self.port)
        st, _, b = c.req("POST", "/api/signup", {"name": "G", "email": email, "password": "correct horse"})
        self.assertEqual(st, 201, b)
        return c

    def with_key(self, email):
        c = self.user(email)
        st, _, b = c.req("PUT", "/api/me/gemini", {"apiKey": GOOD_KEY, "enabled": True})
        self.assertEqual(st, 200, b)
        return c

    def test_crypto_roundtrip_and_tamper(self):
        import base64
        master = os.urandom(32)
        blob = server.encrypt_secret("hello secret", master)
        self.assertTrue(blob.startswith("v1:"))
        self.assertNotIn("hello", blob)
        self.assertNotEqual(blob, server.encrypt_secret("hello secret", master))   # random nonce
        self.assertEqual(server.decrypt_secret(blob, master), "hello secret")
        self.assertIsNone(server.decrypt_secret(blob, os.urandom(32)))
        raw = bytearray(base64.b64decode(blob[3:]))
        raw[20] ^= 1
        self.assertIsNone(server.decrypt_secret("v1:" + base64.b64encode(bytes(raw)).decode(), master))
        for junk in ("", "v1:", "v1:!!!", "v2:abcd", "plain"):
            self.assertIsNone(server.decrypt_secret(junk, master))

    def test_master_key_file_created_once(self):
        path = os.environ["GITASAARTHI_SECRET_KEY_FILE"]
        k1 = server.load_master_key()
        self.assertEqual(len(k1), 32)
        self.assertTrue(os.path.exists(path))
        self.assertEqual(server.load_master_key(), k1)

    def test_get_defaults(self):
        c = self.user("g0@example.com")
        st, _, b = c.req("GET", "/api/me/gemini")
        self.assertEqual((st, b), (200, {"hasKey": False, "keyHint": None, "enabled": False, "model": "gemini-3-flash-preview"}))

    def test_put_get_never_leaks_and_stored_encrypted(self):
        c = self.user("g1@example.com")
        st, _, b = c.req("PUT", "/api/me/gemini", {"apiKey": GOOD_KEY, "enabled": True, "model": "gemini-3.8-pro"})
        self.assertEqual(st, 200)
        self.assertEqual(b, {"hasKey": True, "keyHint": "…" + GOOD_KEY[-4:], "enabled": True, "model": "gemini-3.8-pro"})
        st, _, b2 = c.req("GET", "/api/me/gemini")
        self.assertEqual(b2, b)
        self.assertNotIn(GOOD_KEY, json.dumps(b2))
        st, _, b3 = c.req("PUT", "/api/me/gemini", {"enabled": False})   # partial update keeps the key
        self.assertEqual((st, b3["hasKey"], b3["enabled"], b3["model"]), (200, True, False, "gemini-3.8-pro"))
        conn = server.connect(self.db)
        rows = conn.execute("SELECT value FROM user_secrets").fetchall()
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        conn.close()
        self.assertTrue(rows)
        for r in rows:
            self.assertNotIn(GOOD_KEY, r["value"])
            self.assertNotIn("AIza", r["value"])
        self.assertEqual(version, 2)

    def test_validation(self):
        c = self.user("g2@example.com")
        for body in ({"apiKey": "short"}, {"apiKey": "x" * 401}, {"apiKey": "has space " * 3},
                     {"apiKey": 12345678901234567890}, {"model": "bad model!"}, {"model": ""}, {"model": "a" * 81},
                     {"enabled": "yes"}, {"model": 5}):
            st, _, b = c.req("PUT", "/api/me/gemini", body)
            self.assertEqual((st, b.get("code")), (400, "bad_request"), body)
        self.assertFalse(c.req("GET", "/api/me/gemini")[2]["hasKey"])

    def test_auth_and_csrf(self):
        anon = Client(self.port)
        for m, p, body in (("GET", "/api/me/gemini", None), ("PUT", "/api/me/gemini", {"enabled": True}),
                           ("DELETE", "/api/me/gemini", {}), ("POST", "/api/gemini/test", {}),
                           ("GET", "/api/gemini/models", None),
                           ("POST", "/api/gemini/generate", {"contents": []})):
            self.assertEqual(anon.req(m, p, body)[0], 401, (m, p))
        c = self.user("g3@example.com")
        self.assertEqual(c.req("PUT", "/api/me/gemini", {"enabled": True}, origin=False)[0], 403)
        self.assertEqual(c.req("POST", "/api/gemini/generate", {"contents": []}, origin=False)[0], 403)

    def test_isolation_and_delete(self):
        a = self.with_key("g4a@example.com")
        b = self.user("g4b@example.com")
        self.assertFalse(b.req("GET", "/api/me/gemini")[2]["hasKey"])
        self.assertEqual(b.req("GET", "/api/gemini/models")[2]["code"], "no_key")
        st, _, body = a.req("DELETE", "/api/me/gemini", {})
        self.assertEqual((st, body), (200, {"ok": True}))
        self.assertEqual(a.req("GET", "/api/me/gemini")[2],
                         {"hasKey": False, "keyHint": None, "enabled": False, "model": "gemini-3-flash-preview"})

    def test_account_delete_cascades(self):
        c = self.with_key("g5@example.com")
        uid = c.req("GET", "/api/me")[2]["id"]
        self.assertEqual(c.req("DELETE", "/api/me", {"password": "correct horse"})[0], 200)
        conn = server.connect(self.db)
        n = conn.execute("SELECT COUNT(*) FROM user_secrets WHERE user_id = ?", (uid,)).fetchone()[0]
        conn.close()
        self.assertEqual(n, 0)

    def test_tampered_blob_is_no_key(self):
        c = self.with_key("g6@example.com")
        uid = c.req("GET", "/api/me")[2]["id"]
        conn = server.connect(self.db)
        conn.execute("UPDATE user_secrets SET value = 'v1:AAAA' WHERE user_id = ?", (uid,))
        conn.commit()
        conn.close()
        self.assertFalse(c.req("GET", "/api/me/gemini")[2]["hasKey"])
        self.assertEqual(c.req("POST", "/api/gemini/test", {})[2]["code"], "no_key")

    def test_test_endpoint(self):
        c = self.with_key("g7@example.com")
        StubGoogle.seen.clear()
        st, _, b = c.req("POST", "/api/gemini/test", {})
        self.assertEqual((st, b), (200, {"ok": True}))
        path, body = StubGoogle.seen[-1]
        self.assertEqual(path, "/v1beta/models/gemini-3-flash-preview:generateContent")
        self.assertNotIn(GOOD_KEY, path)
        self.assertIn("Reply with OK", json.dumps(body))

    def test_test_endpoint_bad_model(self):
        c = self.with_key("g8@example.com")
        c.req("PUT", "/api/me/gemini", {"model": "nope"})
        st, _, b = c.req("POST", "/api/gemini/test", {})
        self.assertEqual((st, b["code"]), (400, "gemini_error"))
        self.assertIn("not found", b["error"])
        self.assertNotIn(GOOD_KEY, json.dumps(b))

    def test_test_endpoint_wrong_key_is_scrubbed(self):
        wrong = "wrong_key_wrong_key_wrong_key"
        c = self.user("g9@example.com")
        c.req("PUT", "/api/me/gemini", {"apiKey": wrong})
        st, _, b = c.req("POST", "/api/gemini/test", {})
        self.assertEqual((st, b["code"]), (400, "gemini_error"))
        self.assertNotIn(wrong, json.dumps(b))

    def test_models(self):
        c = self.with_key("g10@example.com")
        st, _, b = c.req("GET", "/api/gemini/models")
        self.assertEqual((st, b), (200, {"models": [{"id": "gemini-3.8-flash", "label": "Gemini 3.8 Flash"}]}))

    def test_generate_passthrough(self):
        c = self.with_key("g11@example.com")
        StubGoogle.seen.clear()
        payload = {"contents": [{"role": "user", "parts": [{"text": "hi"}]}],
                   "systemInstruction": {"parts": [{"text": "be kind"}]}, "generationConfig": {"temperature": 0.5}}
        st, _, b = c.req("POST", "/api/gemini/generate", payload)
        self.assertEqual((st, b), (200, CANNED))
        path, sent = StubGoogle.seen[-1]
        self.assertEqual(path, "/v1beta/models/gemini-3-flash-preview:generateContent")
        self.assertEqual(sent, payload)
        c.req("POST", "/api/gemini/generate", dict(payload, model="gemini-3.8-pro"))
        self.assertEqual(StubGoogle.seen[-1][0], "/v1beta/models/gemini-3.8-pro:generateContent")
        st, _, b = c.req("POST", "/api/gemini/generate", dict(payload, model="nope"))   # google 4xx passes through
        self.assertEqual(st, 404)
        self.assertIn("not found", json.dumps(b))
        self.assertNotIn(GOOD_KEY, json.dumps(b))

    def test_generate_validation_and_no_key(self):
        c = self.user("g12@example.com")
        st, _, b = c.req("POST", "/api/gemini/generate", {"contents": [{"parts": [{"text": "x"}]}]})
        self.assertEqual((st, b["code"]), (400, "no_key"))
        c = self.with_key("g13@example.com")
        for bad in ({}, {"contents": "x"}, {"contents": [], "model": "bad model"},
                    {"contents": [], "systemInstruction": "x"}, {"contents": [], "generationConfig": []}):
            self.assertEqual(c.req("POST", "/api/gemini/generate", bad)[0], 400, bad)
        big = {"contents": [{"parts": [{"text": "x" * (260 * 1024)}]}]}
        self.assertEqual(c.req("POST", "/api/gemini/generate", big)[0], 413)

    def test_generate_network_error_is_502(self):
        c = self.with_key("g14@example.com")
        old = server.GEMINI_BASE
        server.GEMINI_BASE = "http://127.0.0.1:1"
        try:
            st, _, b = c.req("POST", "/api/gemini/generate", {"contents": [{"parts": [{"text": "x"}]}]})
        finally:
            server.GEMINI_BASE = old
        self.assertEqual((st, b["code"]), (502, "gemini_error"))
        self.assertNotIn(GOOD_KEY, json.dumps(b))

    def test_generate_rate_limit(self):
        c = self.with_key("g15@example.com")
        payload = {"contents": [{"parts": [{"text": "x"}]}]}
        for i in range(30):
            self.assertEqual(c.req("POST", "/api/gemini/generate", payload)[0], 200, i)
        st, _, b = c.req("POST", "/api/gemini/generate", payload)
        self.assertEqual((st, b["code"]), (429, "throttled"))
        other = self.with_key("g16@example.com")
        self.assertEqual(other.req("POST", "/api/gemini/generate", payload)[0], 200)


HOSTED_VARS = ("VERCEL", "GITASAARTHI_MASTER_KEY", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN",
               "GITASAARTHI_PUBLIC_ORIGIN", "GITASAARTHI_SECRET_KEY_FILE")


class MasterKeyEnvTest(unittest.TestCase):
    """GITASAARTHI_MASTER_KEY (base64 of 32 bytes) wins over the key file; hosted runs refuse without it."""

    def setUp(self):
        import base64
        from unittest import mock
        self.b64 = base64.b64encode
        self.tmp = tempfile.TemporaryDirectory()
        self.key_file = os.path.join(self.tmp.name, "secret.key")
        saved = {k: os.environ[k] for k in HOSTED_VARS if k in os.environ}
        self.env = mock.patch.dict(os.environ, saved, clear=False)
        self.env.start()
        for k in HOSTED_VARS:
            os.environ.pop(k, None)
        os.environ["GITASAARTHI_SECRET_KEY_FILE"] = self.key_file
        self.saved_master = dict(server._MASTER)
        server._MASTER.clear()

    def tearDown(self):
        self.env.stop()
        server._MASTER.clear()
        server._MASTER.update(self.saved_master)
        self.tmp.cleanup()

    def hosted(self, **extra):
        os.environ.update({"VERCEL": "1", "TURSO_DATABASE_URL": "libsql://x.turso.io", "TURSO_AUTH_TOKEN": "t",
                           "GITASAARTHI_PUBLIC_ORIGIN": "https://gs.example"})
        os.environ.update(extra)

    def test_key_from_env_decrypts_and_wins_over_file(self):
        with open(self.key_file, "wb") as f:
            f.write(os.urandom(32))
        master = os.urandom(32)
        blob = server.encrypt_secret("gemini key", master)
        os.environ["GITASAARTHI_MASTER_KEY"] = self.b64(master).decode()
        self.assertEqual(server.load_master_key(), master)
        self.assertEqual(server.decrypt_secret(blob, server.load_master_key()), "gemini key")
        server.require_runtime_env()   # valid: no error

    def test_env_key_is_not_written_to_disk(self):
        os.environ["GITASAARTHI_MASTER_KEY"] = self.b64(os.urandom(32)).decode()
        server.load_master_key()
        self.assertFalse(os.path.exists(self.key_file))

    def test_bad_env_key_is_a_clear_startup_error(self):
        for bad in (self.b64(os.urandom(31)).decode(), self.b64(os.urandom(33)).decode(), "not base64 !!!", " "):
            os.environ["GITASAARTHI_MASTER_KEY"] = bad
            with self.assertRaises(SystemExit) as cm:
                server.require_runtime_env()
            msg = str(cm.exception.code)
            self.assertIn("GITASAARTHI_MASTER_KEY", msg)
            if bad.strip():
                self.assertNotIn(bad, msg)
            with self.assertRaises(RuntimeError):
                server.load_master_key()
            self.assertFalse(os.path.exists(self.key_file))

    def test_vercel_without_key_refuses_and_never_creates_a_key_file(self):
        self.hosted()
        with self.assertRaises(SystemExit) as cm:
            server.require_runtime_env()
        self.assertIn("GITASAARTHI_MASTER_KEY", str(cm.exception.code))
        with self.assertRaises(RuntimeError):
            server.load_master_key()
        self.assertFalse(os.path.exists(self.key_file))
        with self.assertRaises(SystemExit):
            server.build_server(0, os.path.join(self.tmp.name, "v.db"))

    def test_vercel_requires_turso_and_public_origin(self):
        for missing in ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GITASAARTHI_PUBLIC_ORIGIN"):
            self.hosted(GITASAARTHI_MASTER_KEY=self.b64(os.urandom(32)).decode())
            os.environ.pop(missing)
            with self.assertRaises(SystemExit) as cm:
                server.require_runtime_env()
            self.assertIn(missing, str(cm.exception.code))

    def test_vercel_refuses_in_memory_throttle(self):
        self.hosted()
        with self.assertRaises(RuntimeError):
            server.Throttle()
        self.assertEqual(server.Throttle(os.path.join(self.tmp.name, "v.db")).db_path, os.path.join(self.tmp.name, "v.db"))

    def test_vercel_with_everything_set_starts(self):
        master = os.urandom(32)
        self.hosted(GITASAARTHI_MASTER_KEY=self.b64(master).decode())
        server.require_runtime_env()
        self.assertEqual(server.load_master_key(), master)

    def test_local_without_env_still_uses_key_file(self):
        k = server.load_master_key()
        self.assertEqual(len(k), 32)
        self.assertTrue(os.path.exists(self.key_file))
        server.require_runtime_env()


class PersistentThrottleTest(unittest.TestCase):
    """Throttle state lives in throttle_events, so a cold start (a new server on the same DB) keeps it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "t.db")
        server.init_db(self.db)
        self.tag = os.urandom(4).hex()      # unique keys: the turso stub shares one store across tests

    def tearDown(self):
        self.tmp.cleanup()

    def rows(self, sql, params=()):
        conn = server.connect(self.db)
        try:
            return conn.execute(sql, params).fetchall()
        finally:
            conn.close()

    def write(self, sql, params=()):
        conn = server.connect(self.db)
        try:
            conn.execute(sql, params)
            conn.commit()
        finally:
            conn.close()

    def test_schema_has_table_and_index(self):
        names = {r[0] for r in self.rows("SELECT name FROM sqlite_master WHERE name LIKE 'throttle%'")}
        self.assertIn("throttle_events", names)
        self.assertIn("throttle_events_lookup", names)
        server.init_db(self.db)     # idempotent

    def test_login_throttle_survives_a_new_instance(self):
        email, ip = f"cold-{self.tag}@x.co", f"10.{self.tag}"
        t = server.Throttle(self.db)
        for _ in range(server.LOGIN_MAX_PER_ACCOUNT):
            self.assertTrue(t.reserve(email, ip))
        self.assertFalse(t.reserve(email, ip))
        t2 = server.Throttle(self.db)                     # cold start
        self.assertFalse(t2.reserve(email, ip))
        t2.release(email, ip)                              # success clears the account bucket
        self.assertTrue(server.Throttle(self.db).reserve(email, ip))

    def test_release_drops_one_ip_attempt_and_all_account_attempts(self):
        email, ip = f"rel-{self.tag}@x.co", f"11.{self.tag}"
        t = server.Throttle(self.db)
        for _ in range(3):
            t.reserve(email, ip)
        t.release(email, ip)
        acct = self.rows("SELECT COUNT(*) FROM throttle_events WHERE bucket = 'acct' AND key = ?", (email,))[0][0]
        per_ip = self.rows("SELECT COUNT(*) FROM throttle_events WHERE bucket = 'ip' AND key = ?", (ip,))[0][0]
        self.assertEqual((acct, per_ip), (0, 2))

    def test_ip_limit_and_signup_limit_persist(self):
        ip = f"12.{self.tag}"
        t = server.Throttle(self.db)
        for i in range(server.LOGIN_MAX_PER_IP):
            self.assertTrue(t.reserve(f"u{i}-{self.tag}@x.co", ip), i)
        self.assertFalse(server.Throttle(self.db).reserve(f"new-{self.tag}@x.co", ip))
        sip = f"13.{self.tag}"
        for _ in range(server.SIGNUP_MAX_PER_IP):
            self.assertTrue(t.reserve_signup(sip))
        self.assertFalse(server.Throttle(self.db).reserve_signup(sip))
        self.assertTrue(server.Throttle(self.db).reserve_signup(f"14.{self.tag}"))

    def test_gemini_rate_persists(self):
        key = f"gem:{self.tag}"
        t = server.Throttle(self.db)
        for _ in range(server.GEMINI_RATE):
            self.assertTrue(t._reserve([(key, server.GEMINI_RATE)], 60))
        self.assertFalse(server.Throttle(self.db)._reserve([(key, server.GEMINI_RATE)], 60))

    def test_key_is_truncated(self):
        long_email = self.tag + "x" * 1000
        server.Throttle(self.db).reserve(long_email, "1.1.1.1")
        got = self.rows("SELECT key FROM throttle_events WHERE bucket = 'acct' AND key LIKE ?", (self.tag + "%",))
        self.assertEqual([len(r[0]) for r in got], [254])

    def test_old_rows_are_pruned_per_key_and_globally(self):
        import time as _t
        email = f"old-{self.tag}@x.co"
        stale = _t.time() - server.LOGIN_WINDOW - 5
        for _ in range(server.LOGIN_MAX_PER_ACCOUNT):
            self.write("INSERT INTO throttle_events (bucket, key, ts) VALUES ('acct', ?, ?)", (email, stale))
        self.write("INSERT INTO throttle_events (bucket, key, ts) VALUES ('other', ?, ?)",
                   (self.tag, _t.time() - 25 * 3600))
        t = server.Throttle(self.db)
        self.assertTrue(t.reserve(email, f"15.{self.tag}"))     # stale attempts do not count
        n = self.rows("SELECT COUNT(*) FROM throttle_events WHERE bucket = 'acct' AND key = ?", (email,))[0][0]
        self.assertEqual(n, 1)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM throttle_events WHERE bucket = 'other' AND key = ?",
                                   (self.tag,))[0][0], 0)

    def test_server_cold_start_keeps_login_lockout(self):
        email = f"coldhttp-{self.tag}@example.com"
        a = server.build_server(0, self.db)
        reset_stub_throttle()
        threading.Thread(target=a.serve_forever, daemon=True).start()
        try:
            st, _, b = Client(a.server_address[1]).req("POST", "/api/signup",
                                                       {"name": "C", "email": email, "password": "correct horse"})
            self.assertEqual(st, 201, b)
            for _ in range(server.LOGIN_MAX_PER_ACCOUNT):
                st, _, _ = Client(a.server_address[1]).req("POST", "/api/login", {"email": email, "password": "wrong one!"})
                self.assertEqual(st, 401)
        finally:
            a.shutdown()
            a.server_close()
        b2 = server.build_server(0, self.db)              # cold start: fresh process state, same database
        threading.Thread(target=b2.serve_forever, daemon=True).start()
        try:
            st, _, body = Client(b2.server_address[1]).req("POST", "/api/login",
                                                           {"email": email, "password": "correct horse"})
            self.assertEqual((st, body["code"]), (429, "throttled"))
        finally:
            b2.shutdown()
            b2.server_close()


class VercelClientIpTest(unittest.TestCase):
    """On Vercel every request reaches us from the platform's proxy, so the client IP comes from the
    headers Vercel sets (it overwrites client-supplied ones). Elsewhere GITASAARTHI_TRUST_PROXY rules apply."""

    def pick(self, headers, peer="127.0.0.1", vercel=True, trust=False):
        return server.pick_client_ip(peer, headers.get("X-Forwarded-For"), trust,
                                     real_ip=headers.get("X-Real-IP"),
                                     vercel_forwarded=headers.get("X-Vercel-Forwarded-For"), vercel=vercel)

    def test_prefers_x_real_ip(self):
        self.assertEqual(self.pick({"X-Real-IP": "203.0.113.7", "X-Vercel-Forwarded-For": "198.51.100.1",
                                    "X-Forwarded-For": "6.6.6.6, 198.51.100.2"}), "203.0.113.7")

    def test_then_first_vercel_forwarded_entry(self):
        self.assertEqual(self.pick({"X-Real-IP": "nope", "X-Vercel-Forwarded-For": "198.51.100.1, 10.0.0.1"}),
                         "198.51.100.1")

    def test_then_rightmost_forwarded_for(self):
        self.assertEqual(self.pick({"X-Forwarded-For": "6.6.6.6, 2001:db8::5"}), "2001:db8::5")
        self.assertEqual(self.pick({"X-Forwarded-For": "6.6.6.6, junk"}), "127.0.0.1")
        self.assertEqual(self.pick({}), "127.0.0.1")

    def test_off_vercel_headers_ignored_unless_trusted(self):
        h = {"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "6.6.6.6, 8.8.8.8"}
        self.assertEqual(self.pick(h, vercel=False), "127.0.0.1")
        self.assertEqual(self.pick(h, vercel=False, trust=True), "8.8.8.8")

    def test_vercel_default_reads_env_at_call_time(self):
        from unittest import mock
        with mock.patch.dict(os.environ, {"VERCEL": "1"}):
            self.assertEqual(server.pick_client_ip("127.0.0.1", None, False, real_ip="203.0.113.9"), "203.0.113.9")
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VERCEL", None)
            self.assertEqual(server.pick_client_ip("127.0.0.1", None, False, real_ip="203.0.113.9"), "127.0.0.1")


class VercelEdgeTest(unittest.TestCase):
    """HTTP-level: per-IP throttle keyed on the Vercel client IP, and the CSRF origin allowlist."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = os.path.join(cls.tmp.name, "edge.db")
        cls.httpd = server.build_server(0, cls.db)       # built before VERCEL is set: no hosted env needed
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        from unittest import mock
        reset_stub_throttle()
        self.tag = os.urandom(4).hex()
        env = {"VERCEL": "1"}
        for k in ("GITASAARTHI_PUBLIC_ORIGIN", "GITASAARTHI_ALLOWED_ORIGINS", "VERCEL_URL"):
            env[k] = ""
        self.env = mock.patch.dict(os.environ, env)
        self.env.start()
        self.addCleanup(self.env.stop)

    def signup(self, n, headers):
        return Client(self.port).req("POST", "/api/signup", {"name": "E", "email": f"e{n}-{self.tag}@example.com",
                                                              "password": "correct horse"}, headers=headers)

    def test_two_clients_do_not_share_the_ip_throttle(self):
        from unittest import mock
        with mock.patch.object(server, "SIGNUP_MAX_PER_IP", 2):
            a = {"X-Real-IP": "203.0.113.10"}
            self.assertEqual(self.signup(1, a)[0], 201)
            self.assertEqual(self.signup(2, a)[0], 201)
            self.assertEqual(self.signup(3, a)[0], 429)
            self.assertEqual(self.signup(4, {"X-Real-IP": "203.0.113.11"})[0], 201)

    def test_spoofed_leftmost_forwarded_for_does_not_change_the_ip(self):
        from unittest import mock
        with mock.patch.object(server, "SIGNUP_MAX_PER_IP", 2):
            self.assertEqual(self.signup(1, {"X-Forwarded-For": "1.1.1.1, 198.51.100.20"})[0], 201)
            self.assertEqual(self.signup(2, {"X-Forwarded-For": "2.2.2.2, 198.51.100.20"})[0], 201)
            self.assertEqual(self.signup(3, {"X-Forwarded-For": "3.3.3.3, 198.51.100.20"})[0], 429)
            self.assertEqual(self.signup(4, {"X-Real-IP": "203.0.113.12",
                                             "X-Forwarded-For": "203.0.113.10, 198.51.100.20"})[0], 201)

    def login(self, origin, host=None):
        h = {"Origin": origin}
        if host:
            h["Host"] = host
        return Client(self.port).req("POST", "/api/login", {"email": f"nobody-{self.tag}@example.com",
                                                             "password": "wrong one!"}, headers=h)[0]

    def test_public_origin_passes_when_host_differs(self):
        os.environ["GITASAARTHI_PUBLIC_ORIGIN"] = "https://gita.example"
        self.assertEqual(self.login("https://gita.example", host="internal.local"), 401)
        self.assertEqual(self.login("https://gita.example/", host="internal.local"), 401)

    def test_allowed_origins_list_and_vercel_url(self):
        os.environ["GITASAARTHI_ALLOWED_ORIGINS"] = "https://a.example, https://b.example:8443"
        os.environ["VERCEL_URL"] = "gita-abc123-team.vercel.app"
        self.assertEqual(self.login("https://b.example:8443", host="internal.local"), 401)
        self.assertEqual(self.login("https://a.example", host="internal.local"), 401)
        self.assertEqual(self.login("https://gita-abc123-team.vercel.app", host="internal.local"), 401)
        self.assertEqual(self.login("http://gita-abc123-team.vercel.app", host="internal.local"), 403)

    def test_foreign_origin_still_refused(self):
        os.environ["GITASAARTHI_PUBLIC_ORIGIN"] = "https://gita.example"
        os.environ["GITASAARTHI_ALLOWED_ORIGINS"] = "https://a.example"
        self.assertEqual(self.login("https://evil.example", host="internal.local"), 403)
        self.assertEqual(self.login("https://gita.example.evil.example", host="internal.local"), 403)
        self.assertEqual(self.login("https://a.example.evil", host="internal.local"), 403)
        self.assertEqual(self.login("null", host="internal.local"), 403)
        self.assertEqual(self.login(f"http://localhost:{self.port}"), 401)      # same-host rule unchanged


class VercelEntryTest(unittest.TestCase):
    """api/index.py is what Vercel runs. Its server object is Vercel's, not build_server's."""

    def load_entry(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(f"vercel_entry_{os.urandom(3).hex()}",
                                                      os.path.join(ROOT, "api", "index.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_exposes_a_request_handler_class(self):
        mod = self.load_entry()
        self.assertTrue(isinstance(mod.handler, type) and issubclass(mod.handler, http.server.BaseHTTPRequestHandler))
        self.assertTrue(issubclass(mod.handler, server.Handler))

    def test_serves_from_a_plain_http_server(self):
        from unittest import mock
        mod = self.load_entry()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        reset_stub_throttle()
        with mock.patch.object(server, "DEFAULT_DB", os.path.join(tmp.name, "entry.db")):
            httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mod.handler)   # no db_path, no throttle
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            try:
                port = httpd.server_address[1]
                c0 = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                c0.request("GET", "/login.html")
                r = c0.getresponse()
                r.read()
                c0.close()
                self.assertEqual(r.status, 200)
                self.assertIn("default-src", r.getheader("Content-Security-Policy") or "")
                self.assertEqual(Client(port).req("GET", "/")[0], 302)     # "/" opens the sign-in page
                email = f"entry-{os.urandom(4).hex()}@example.com"
                c = Client(port)
                st, _, b = c.req("POST", "/api/signup", {"name": "V", "email": email, "password": "correct horse"})
                self.assertEqual(st, 201, b)
                st, _, b = Client(port).req("POST", "/api/login", {"email": email, "password": "correct horse"})
                self.assertEqual(st, 200, b)
                st, loc, _ = Client(port).req("GET", "/admin.html")
                self.assertNotEqual(st, 200)                   # page gating still runs in Python
            finally:
                httpd.shutdown()
                httpd.server_close()
        self.assertEqual(mod._STATE.get("db_path"), os.path.join(tmp.name, "entry.db"))

    def test_init_runs_once_under_concurrency(self):
        from unittest import mock
        mod = self.load_entry()
        calls = []
        with mock.patch.object(server, "init_db", side_effect=lambda p: calls.append(p)), \
                mock.patch.object(server, "purge_expired_sessions"), \
                mock.patch.object(server, "Throttle", side_effect=lambda p: object()):
            ts = [threading.Thread(target=mod.ensure_ready) for _ in range(8)]
            for t in ts:
                t.start()
            for t in ts:
                t.join()
        self.assertEqual(len(calls), 1)

    def test_failed_init_answers_503_then_recovers(self):
        from unittest import mock
        mod = self.load_entry()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mod.handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            port = httpd.server_address[1]
            with mock.patch.object(server, "DEFAULT_DB", os.path.join(tmp.name, "r.db")):
                with mock.patch.object(server, "init_db", side_effect=RuntimeError("db down")):
                    self.assertEqual(Client(port).req("GET", "/login.html")[0], 503)
                self.assertEqual(Client(port).req("GET", "/login.html")[0], 200)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_failed_init_is_retried(self):
        from unittest import mock
        mod = self.load_entry()
        with mock.patch.object(server, "init_db", side_effect=RuntimeError("db down")), \
                mock.patch.object(server, "purge_expired_sessions"):
            with self.assertRaises(RuntimeError):
                mod.ensure_ready()
        with mock.patch.object(server, "init_db"), mock.patch.object(server, "purge_expired_sessions"), \
                mock.patch.object(server, "Throttle", side_effect=lambda p: object()):
            mod.ensure_ready()
        self.assertTrue(mod._STATE.get("ready"))


class VercelConfigTest(unittest.TestCase):
    def load(self):
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_everything_routes_to_the_python_function(self):
        cfg = self.load()
        routes = cfg.get("routes", []) + [{"src": r["source"], "dest": r["destination"]} for r in cfg.get("rewrites", [])]
        self.assertIn({"src": "/(.*)", "dest": "/api/index"}, routes)
        # a catch-all route must come before any filesystem phase, or the CDN serves the HTML without our headers
        self.assertNotIn("filesystem", [r.get("handle") for r in cfg.get("routes", [])])

    def test_no_node_build_and_bundle_excludes(self):
        cfg = self.load()
        self.assertIsNone(cfg.get("framework", "missing"))
        self.assertEqual(cfg.get("buildCommand"), "")
        self.assertEqual(cfg.get("installCommand"), "")
        excl = cfg["functions"]["api/index.py"]["excludeFiles"]
        for part in ("tests/**", "_archive/**", "docs/**", "node_modules/**", "scripts/**", "data/**"):
            self.assertIn(part, excl)

    def test_vercelignore_keeps_secrets_and_data_out(self):
        with open(os.path.join(ROOT, ".vercelignore"), encoding="utf-8") as f:
            lines = {ln.strip() for ln in f if ln.strip() and not ln.startswith("#")}
        for want in ("data/", "*.db", "secret.key", ".env*", "tests/", "_archive/", "node_modules/",
                     ".backup-before-unslop/", "docs/", "videos/", "screenshots/"):
            self.assertIn(want, lines)

    def test_server_module_is_not_a_zero_config_entrypoint(self):
        # Vercel scans a root server.py for top-level `app` / `application`; those must not exist.
        self.assertFalse(hasattr(server, "app") or hasattr(server, "application"))


if __name__ == "__main__":
    unittest.main()
