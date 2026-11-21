"""Turso adapter tests, against a local stub of the libSQL /v2/pipeline API (no network).
Run:  python -m unittest tests/test_turso_adapter.py -v

The stub runs real SQLite on a temp-file database (WAL), one connection per stream (baton), so
transaction and constraint behaviour match what the adapter will meet on Turso. A temp file is used
rather than a shared-cache in-memory database because shared cache raises "table is locked" under
concurrent streams instead of waiting.
"""
import base64
import http.server
import itertools
import json
import os
import re
import secrets
import sqlite3
import sys
import tempfile
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import db_turso  # noqa: E402
import server  # noqa: E402


# ---------------------------------------------------------------- stub server
def _encode_value(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, bytes):
        return {"type": "blob", "base64": base64.b64encode(v).decode("ascii")}
    return {"type": "text", "value": str(v)}


def _decode_value(v):
    t = v["type"]
    if t == "null":
        return None
    if t == "integer":
        if not isinstance(v["value"], str):
            raise ValueError("integer value must be a JSON string")
        return int(v["value"])
    if t == "float":
        if not isinstance(v["value"], (int, float)):
            raise ValueError("float value must be a JSON number")
        return float(v["value"])
    if t == "text":
        return v["value"]
    if t == "blob":
        return base64.b64decode(v["base64"])
    raise ValueError(f"bad value type {t}")


class TursoStub:
    """Minimal Hrana-over-HTTP v2 server: POST /v2/pipeline with execute / sequence / close."""

    def __init__(self, token="stub-token", reject_pragmas=("journal_mode",)):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "turso.db")
        c = sqlite3.connect(self.path)
        c.execute("PRAGMA journal_mode = WAL")
        c.close()
        self.token = token
        self.reject_pragmas = set(reject_pragmas)
        self.streams = {}
        self.lock = threading.Lock()
        self.counter = itertools.count(1)
        self.requests_seen = []
        self.ports_seen = []       # client port of each request: one port = one kept-alive connection
        self.sockets = set()
        stub = self

        class H(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"     # keep-alive, like Turso

            def log_message(self, *a):
                pass

            def setup(self):
                super().setup()
                with stub.lock:
                    stub.sockets.add(self.connection)

            def finish(self):
                with stub.lock:
                    stub.sockets.discard(self.connection)
                super().finish()

            def do_POST(self):
                stub.handle(self)

        class Server(http.server.ThreadingHTTPServer):
            def handle_error(self, request, client_address):
                if not isinstance(sys.exc_info()[1], OSError):   # a dropped connection is expected noise
                    super().handle_error(request, client_address)

        self.httpd = Server(("127.0.0.1", 0), H)
        self.httpd.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        with self.lock:
            for c in self.streams.values():
                c.close()
            self.streams.clear()
        self.tmp.cleanup()

    def drop_connections(self):
        """Close every kept-alive client connection from the server side, as an idle timeout would."""
        with self.lock:
            socks = list(self.sockets)
        for s in socks:
            try:
                s.shutdown(__import__("socket").SHUT_RDWR)
            except OSError:
                pass

    def raw(self):
        """A direct SQLite connection to the stub's database, for assertions."""
        return sqlite3.connect(self.path, timeout=10)

    def _reply(self, h, status, obj):
        data = json.dumps(obj).encode()
        h.send_response(status)
        h.send_header("Content-Type", "application/json")
        h.send_header("Content-Length", str(len(data)))
        h.end_headers()
        h.wfile.write(data)

    def handle(self, h):
        raw_body = h.rfile.read(int(h.headers.get("Content-Length", 0)))   # always, or keep-alive desyncs
        if h.path != "/v2/pipeline":
            return self._reply(h, 404, {"message": "not found"})
        if h.headers.get("Authorization") != f"Bearer {self.token}":
            return self._reply(h, 401, {"message": "Unauthorized"})
        body = json.loads(raw_body)
        self.requests_seen.append(body)
        self.ports_seen.append(h.client_address[1])
        baton = body.get("baton")
        with self.lock:
            if baton is None:
                conn = sqlite3.connect(self.path, timeout=10, isolation_level=None, check_same_thread=False)
            else:
                conn = self.streams.pop(baton, None)
        if conn is None:
            return self._reply(h, 400, {"message": "invalid baton"})
        results, open_ = [], True
        for req in body["requests"]:
            if req["type"] == "close":
                conn.close()
                open_ = False
                results.append({"type": "ok", "response": {"type": "close"}})
                continue
            try:
                if req["type"] == "execute":
                    results.append({"type": "ok", "response": {"type": "execute",
                                                               "result": self._execute(conn, req["stmt"])}})
                elif req["type"] == "sequence":
                    conn.executescript(req["sql"])
                    results.append({"type": "ok", "response": {"type": "sequence"}})
                else:
                    raise ValueError(f"unsupported request {req['type']}")
            except sqlite3.Error as e:
                results.append({"type": "error", "error": {"message": f"SQLite error: {e}",
                                                           "code": getattr(e, "sqlite_errorname", "SQLITE_ERROR")}})
        new_baton = None
        if open_:
            new_baton = f"b{next(self.counter)}-{secrets.token_hex(4)}"
            with self.lock:
                self.streams[new_baton] = conn
        self._reply(h, 200, {"baton": new_baton, "base_url": None, "results": results})

    def _execute(self, conn, stmt):
        sql = stmt["sql"]
        m = re.match(r"\s*PRAGMA\s+(\w+)", sql, re.I)
        if m and m.group(1).lower() in self.reject_pragmas:
            raise sqlite3.OperationalError(f"PRAGMA {m.group(1)} is not allowed")
        if "named_args" in stmt and stmt["named_args"]:
            args = {a["name"].lstrip(":@$"): _decode_value(a["value"]) for a in stmt["named_args"]}
        else:
            args = [_decode_value(a) for a in stmt.get("args", [])]
        cur = conn.execute(sql, args)
        rows = cur.fetchall()
        cols = [{"name": d[0], "decltype": None} for d in (cur.description or [])]
        return {"cols": cols, "rows": [[_encode_value(v) for v in r] for r in rows],
                "affected_row_count": max(cur.rowcount, 0),
                "last_insert_rowid": str(cur.lastrowid) if cur.lastrowid else None}


def start_stub(**kw):
    return TursoStub(**kw)


# ---------------------------------------------------------------- tests
class TursoAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = TursoStub()

    @classmethod
    def tearDownClass(cls):
        cls.stub.stop()

    def conn(self, token=None):
        return db_turso.TursoConnection(self.stub.url, token or self.stub.token)

    def setUp(self):
        c = self.stub.raw()
        c.executescript("DROP TABLE IF EXISTS t; CREATE TABLE t (id INTEGER PRIMARY KEY, i INTEGER, f REAL, "
                        "s TEXT UNIQUE, b BLOB, n TEXT);")
        c.close()

    def test_url_mapping(self):
        self.assertEqual(db_turso.http_url("libsql://db-org.turso.io"), "https://db-org.turso.io")
        self.assertEqual(db_turso.http_url("libsql://db-org.turso.io/"), "https://db-org.turso.io")
        self.assertEqual(db_turso.http_url("https://db-org.turso.io"), "https://db-org.turso.io")
        self.assertEqual(db_turso.http_url("http://127.0.0.1:9"), "http://127.0.0.1:9")
        self.assertEqual(db_turso.http_url("wss://db-org.turso.io"), "https://db-org.turso.io")

    def test_arg_types_round_trip(self):
        c = self.conn()
        big = 2 ** 62 + 7
        c.execute("INSERT INTO t (i, f, s, b, n) VALUES (?,?,?,?,?)", (big, 1.5, "héllo ✓", b"\x00\xff\x10", None))
        c.execute("INSERT INTO t (i, s) VALUES (?, ?)", (True, "bool"))
        c.commit()
        row = c.execute("SELECT i, f, s, b, n FROM t WHERE s = ?", ("héllo ✓",)).fetchone()
        self.assertEqual(tuple(row), (big, 1.5, "héllo ✓", b"\x00\xff\x10", None))
        self.assertIsInstance(row[0], int)
        self.assertIsInstance(row[1], float)
        self.assertIsInstance(row[3], bytes)
        self.assertEqual(c.execute("SELECT i FROM t WHERE s='bool'").fetchone()[0], 1)
        c.close()
        # what went over the wire: integers as strings, floats as numbers, blobs as base64
        sent = [r for b in self.stub.requests_seen for r in b["requests"]
                if r["type"] == "execute" and r["stmt"]["sql"].startswith("INSERT INTO t (i, f")][-1]
        args = sent["stmt"]["args"]
        self.assertEqual(args[0], {"type": "integer", "value": str(big)})
        self.assertEqual(args[1], {"type": "float", "value": 1.5})
        self.assertEqual(args[3], {"type": "blob", "base64": base64.b64encode(b"\x00\xff\x10").decode()})
        self.assertEqual(args[4], {"type": "null"})

    def test_unsupported_param_type(self):
        c = self.conn()
        with self.assertRaises(sqlite3.ProgrammingError):
            c.execute("SELECT ?", (object(),))
        c.close()

    def test_row_access_and_cursor(self):
        c = self.conn()
        c.executemany("INSERT INTO t (i, s) VALUES (?, ?)", [(1, "a"), (2, "b"), (3, "c")])
        c.commit()
        cur = c.execute("SELECT id, i AS Num, s FROM t ORDER BY i")
        self.assertEqual(cur.rowcount, -1)
        row = cur.fetchone()
        self.assertEqual((row["num"], row["NUM"], row[1], row["s"]), (1, 1, 1, "a"))
        self.assertEqual(row.keys(), ["id", "Num", "s"])
        self.assertEqual(len(row), 3)
        with self.assertRaises(IndexError):
            row["missing"]
        self.assertEqual([r["s"] for r in cur], ["b", "c"])
        self.assertIsNone(cur.fetchone())
        self.assertEqual([tuple(r)[1:] for r in c.execute("SELECT id, i, s FROM t ORDER BY i").fetchall()],
                         [(1, "a"), (2, "b"), (3, "c")])
        self.assertEqual({r[0]: r[1] for r in c.execute("SELECT s, i FROM t")}, {"a": 1, "b": 2, "c": 3})
        self.assertIsNone(c.execute("SELECT 1 FROM t WHERE 0").fetchone())
        c.close()

    def test_lastrowid_and_rowcount(self):
        c = self.conn()
        cur = c.execute("INSERT INTO t (i, s) VALUES (?, ?)", (9, "x"))
        rid = cur.lastrowid
        self.assertIsInstance(rid, int)
        c.execute("INSERT INTO t (i, s) VALUES (?, ?)", (9, "y"))
        cur = c.execute("UPDATE t SET n = 'z' WHERE i = ?", (9,))
        self.assertEqual(cur.rowcount, 2)          # read before commit, as cli_reset_password does
        c.commit()
        self.assertEqual(c.execute("SELECT s FROM t WHERE id = ?", (rid,)).fetchone()["s"], "x")
        self.assertEqual(c.execute("DELETE FROM t WHERE i = 404").rowcount, 0)
        c.close()

    def test_reads_see_own_writes_and_others_do_not(self):
        a, b = self.conn(), self.conn()
        a.execute("INSERT INTO t (i, s) VALUES (1, 'mine')")
        self.assertTrue(a.in_transaction)
        self.assertEqual(a.execute("SELECT COUNT(*) FROM t").fetchone()[0], 1)
        self.assertEqual(b.execute("SELECT COUNT(*) FROM t").fetchone()[0], 0)
        a.commit()
        self.assertFalse(a.in_transaction)
        self.assertEqual(b.execute("SELECT COUNT(*) FROM t").fetchone()[0], 1)
        a.close()
        b.close()

    def test_error_mid_request_leaves_no_rows(self):
        c = self.conn()
        c.execute("INSERT INTO t (i, s) VALUES (1, 'first')")
        with self.assertRaises(sqlite3.OperationalError):
            c.execute("INSERT INTO nowhere VALUES (1)")
        c.close()                                   # handler's finally: close without commit
        raw = self.stub.raw()
        self.assertEqual(raw.execute("SELECT COUNT(*) FROM t").fetchone()[0], 0)
        raw.close()

    def test_explicit_rollback(self):
        c = self.conn()
        c.execute("INSERT INTO t (i, s) VALUES (1, 'gone')")
        c.rollback()
        self.assertFalse(c.in_transaction)
        self.assertEqual(c.execute("SELECT COUNT(*) FROM t").fetchone()[0], 0)
        c.commit()                                  # nothing open: no-op
        c.close()

    def test_integrity_error_mapping(self):
        c = self.conn()
        c.execute("INSERT INTO t (i, s) VALUES (1, 'dup')")
        c.commit()
        with self.assertRaises(sqlite3.IntegrityError) as cm:
            c.execute("INSERT INTO t (i, s) VALUES (2, 'dup')")
        self.assertIsInstance(cm.exception, sqlite3.DatabaseError)
        c.close()
        raw = self.stub.raw()
        self.assertEqual(raw.execute("SELECT COUNT(*) FROM t").fetchone()[0], 1)
        raw.close()

    def test_bad_token_is_operational_error_without_leaking_token(self):
        c = db_turso.TursoConnection(self.stub.url, "wrong-secret-token")
        with self.assertRaises(sqlite3.OperationalError) as cm:
            c.execute("SELECT 1")
        self.assertNotIn("wrong-secret-token", str(cm.exception))
        self.assertIn("401", str(cm.exception))
        c.close()

    def test_unreachable_server_is_operational_error(self):
        s = __import__("socket").socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        c = db_turso.TursoConnection(f"http://127.0.0.1:{port}", "t", timeout=2)
        with self.assertRaises(sqlite3.OperationalError):
            c.execute("SELECT 1")
        c.close()

    def test_executescript_and_context_manager(self):
        c = self.conn()
        c.executescript("CREATE TABLE IF NOT EXISTS s1 (x INTEGER); CREATE INDEX IF NOT EXISTS s1x ON s1(x);")
        with c:
            c.execute("INSERT INTO s1 VALUES (1)")
        with self.assertRaises(ValueError):
            with c:
                c.execute("INSERT INTO s1 VALUES (2)")
                raise ValueError("abort")
        self.assertEqual([r[0] for r in c.execute("SELECT x FROM s1")], [1])
        c.executescript("DROP TABLE s1;")
        c.close()

    def test_pragmas(self):
        c = self.conn()
        c.execute("PRAGMA journal_mode = WAL")      # stub rejects it, like libSQL; adapter must not crash
        c.execute("PRAGMA user_version = 7")
        self.assertEqual(c.execute("PRAGMA user_version").fetchone()[0], 7)
        c.execute("PRAGMA user_version = 8")
        self.assertEqual(c.execute("PRAGMA user_version").fetchone()[0], 8)
        c.close()
        raw = self.stub.raw()
        self.assertEqual(raw.execute("SELECT version FROM schema_meta").fetchall(), [(8,)])
        raw.close()

    def test_one_kept_alive_connection_per_thread(self):
        """A transaction, its commit, and a second TursoConnection on the same thread share one TCP
        (on Turso: TLS) connection, instead of a new one per statement."""
        self.stub.drop_connections()
        start = len(self.stub.ports_seen)
        c = self.conn()
        c.execute("INSERT INTO t (i, s) VALUES (1, 'a')")
        c.execute("SELECT COUNT(*) FROM t").fetchone()
        c.commit()
        c.close()
        d = self.conn()
        self.assertEqual(d.execute("SELECT COUNT(*) FROM t").fetchone()[0], 1)
        d.close()
        ports = self.stub.ports_seen[start:]
        self.assertGreaterEqual(len(ports), 4)
        self.assertEqual(len(set(ports)), 1, ports)

    def test_recovers_when_server_drops_the_kept_connection(self):
        c = self.conn()
        c.execute("SELECT 1").fetchone()
        self.stub.drop_connections()
        self.assertEqual(c.execute("SELECT 2").fetchone()[0], 2)     # one retry on a fresh connection
        c.execute("INSERT INTO t (i, s) VALUES (1, 'after-drop')")
        c.commit()
        self.assertEqual(c.execute("SELECT COUNT(*) FROM t").fetchone()[0], 1)
        c.close()

    def test_error_status_body_is_read_and_connection_reused(self):
        bad = db_turso.TursoConnection(self.stub.url, "wrong")
        for _ in range(2):
            with self.assertRaises(sqlite3.OperationalError):
                bad.execute("SELECT 1")
        bad.close()
        c = self.conn()
        self.assertEqual(c.execute("SELECT 3").fetchone()[0], 3)
        c.close()

    def test_user_version_without_schema_meta_is_zero(self):
        raw = self.stub.raw()
        raw.execute("DROP TABLE IF EXISTS schema_meta")
        raw.commit()
        raw.close()
        c = self.conn()
        self.assertEqual(c.execute("PRAGMA user_version").fetchone()[0], 0)
        c.close()


class ServerConnectRoutingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = TursoStub()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.old = {k: os.environ.get(k) for k in ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN")}

    @classmethod
    def tearDownClass(cls):
        cls.restore()
        cls.stub.stop()
        cls.tmp.cleanup()

    @classmethod
    def restore(cls):
        for k, v in cls.old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def use_turso(self):
        os.environ["TURSO_DATABASE_URL"] = self.stub.url
        os.environ["TURSO_AUTH_TOKEN"] = self.stub.token
        self.addCleanup(self.restore)

    def test_sqlite_without_env(self):
        os.environ.pop("TURSO_DATABASE_URL", None)
        self.addCleanup(self.restore)
        c = server.connect(os.path.join(self.tmp.name, "local.db"))
        self.assertIsInstance(c, sqlite3.Connection)
        self.assertIs(c.row_factory, sqlite3.Row)
        c.close()

    def test_turso_with_env_and_init_db(self):
        self.use_turso()
        db = os.path.join(self.tmp.name, "ignored.db")
        server.init_db(db)
        server.init_db(db)                          # idempotent
        c = server.connect(db)
        self.assertIsInstance(c, db_turso.TursoConnection)
        self.assertEqual(c.execute("PRAGMA user_version").fetchone()[0], server.SCHEMA_VERSION)
        c.close()
        self.assertFalse(os.path.exists(db))

    def test_foreign_keys_cascade_on_turso(self):
        self.use_turso()
        server.init_db("unused.db")
        c = server.connect("unused.db")
        uid = c.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?,?,?,?)",
                        ("fk@example.com", "F", "x", "now")).lastrowid
        c.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, 'last', '{}', 'now')", (uid,))
        c.commit()
        c.execute("DELETE FROM users WHERE id = ?", (uid,))
        c.commit()
        self.assertEqual(c.execute("SELECT COUNT(*) FROM user_data WHERE user_id = ?", (uid,)).fetchone()[0], 0)
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (999999, 'last', '{}', 'n')")
        c.close()


if __name__ == "__main__":
    unittest.main()
