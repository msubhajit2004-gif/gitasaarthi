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
        r, body = self.raw_headers("/audio/krishna.webm", {"Range": "bytes=0-99"})
        self.assertEqual(r.status, 206)
        self.assertEqual(len(body), 100)
        self.assertTrue(r.getheader("Content-Range").startswith("bytes 0-99/"))
        self.assertEqual(r.getheader("Accept-Ranges"), "bytes")
        r, body = self.raw_headers("/audio/krishna.webm", {"Range": "bytes=-10"})
        self.assertEqual((r.status, len(body)), (206, 10))
        r, _ = self.raw_headers("/audio/krishna.webm", {"Range": "bytes=999999999-"})
        self.assertEqual(r.status, 416)
        r, body = self.raw_headers("/audio/krishna.webm")
        self.assertEqual(r.status, 200)
        self.assertEqual(r.getheader("Accept-Ranges"), "bytes")

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
        self.assertEqual((st, b), (200, {"hasKey": False, "keyHint": None, "enabled": False, "model": "gemini-3.8-flash"}))

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
                         {"hasKey": False, "keyHint": None, "enabled": False, "model": "gemini-3.8-flash"})

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
        self.assertEqual(path, "/v1beta/models/gemini-3.8-flash:generateContent")
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
        self.assertEqual(path, "/v1beta/models/gemini-3.8-flash:generateContent")
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


if __name__ == "__main__":
    unittest.main()
