"""Turso (libSQL) over HTTP, shaped like the slice of sqlite3.Connection that server.py uses.

Standard library only (http.client, one kept-alive connection per thread and host). Speaks the Hrana-over-HTTP v2 API: POST {url}/v2/pipeline with
{"baton": str|null, "requests": [{"type": "execute", "stmt": {"sql", "args": [Value]}}, {"type": "close"}]}.
Value: {"type": "null"} | {"type": "integer", "value": "<string>"} | {"type": "float", "value": <number>}
     | {"type": "text", "value": str} | {"type": "blob", "base64": str}.
Result: {"type": "ok", "response": {"type": "execute", "result": {"cols": [{"name"}], "rows": [[Value]],
         "affected_row_count": int, "last_insert_rowid": str|null}}} or {"type": "error", "error": {"message", "code"}}.

Transactions follow Python's sqlite3 (legacy) rules: an implicit BEGIN before the first INSERT / UPDATE /
DELETE / REPLACE, nothing before reads or DDL. While a transaction is open every statement goes over one
stream (baton), so reads see this connection's own writes; commit() sends COMMIT, rollback()/close() send
ROLLBACK. Outside a transaction each statement is one self-contained pipeline ending in close, so no
stream sits open across slow work (Turso closes idle streams after ~10 s).

PRAGMA foreign_keys is per stream and ignored inside a transaction, so it is replayed at the start of
every new stream. PRAGMA journal_mode is a no-op here. PRAGMA user_version lives in schema_meta(version).
Errors raise sqlite3.IntegrityError (constraint failures) or sqlite3.OperationalError subclasses, so
existing `except sqlite3.Error` / `except sqlite3.IntegrityError` clauses keep working.
"""
import base64
import http.client
import json
import re
import sqlite3
import threading
import urllib.parse

_DML = {"INSERT", "UPDATE", "DELETE", "REPLACE"}
_PRAGMA = re.compile(r"^\s*PRAGMA\s+(\w+)\s*(?:=\s*(.+?))?\s*;?\s*$", re.I | re.S)


class TursoOperationalError(sqlite3.OperationalError):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.sqlite_errorname = code


class TursoIntegrityError(sqlite3.IntegrityError):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.sqlite_errorname = code


def http_url(url):
    """libsql:// and wss:// become https://, ws:// becomes http://; no trailing slash."""
    url = url.strip()
    for old, new in (("libsql://", "https://"), ("wss://", "https://"), ("ws://", "http://")):
        if url.lower().startswith(old):
            url = new + url[len(old):]
            break
    return url.rstrip("/")


def encode_value(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, str):
        return {"type": "text", "value": v}
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode("ascii")}
    raise sqlite3.ProgrammingError(f"Error binding parameter: type {type(v).__name__} is not supported")


def decode_value(v):
    t = v.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(v["value"])
    if t == "float":
        return float(v["value"])
    if t == "text":
        return v["value"]
    if t == "blob":
        return base64.b64decode(v.get("base64") or "")
    raise TursoOperationalError(f"Turso returned an unknown value type {t!r}")


def _error(err):
    message = (err or {}).get("message") or "Turso error"
    code = (err or {}).get("code")
    if (code or "").upper().startswith("SQLITE_CONSTRAINT") or "constraint failed" in message.lower():
        return TursoIntegrityError(message, code)
    return TursoOperationalError(message, code)


def _first_keyword(sql):
    s = sql
    while True:
        s = s.lstrip()
        if s.startswith("--"):
            s = s.split("\n", 1)[1] if "\n" in s else ""
        elif s.startswith("/*"):
            s = s.split("*/", 1)[1] if "*/" in s else ""
        else:
            break
    m = re.match(r"[A-Za-z]+", s)
    return m.group(0).upper() if m else ""


class Row:
    """sqlite3.Row look-alike: index, case-insensitive name, keys(), len, iteration, equality."""
    __slots__ = ("_cols", "_values")

    def __init__(self, cols, values):
        self._cols = cols
        self._values = tuple(values)

    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return self._values[key]
        if isinstance(key, str):
            low = key.lower()
            for i, c in enumerate(self._cols):
                if c is not None and c.lower() == low:
                    return self._values[i]
            raise IndexError("No item with that key")
        raise TypeError("Row indices must be integers, slices or strings")

    def keys(self):
        return list(self._cols)

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def __eq__(self, other):
        if isinstance(other, Row):
            return self._cols == other._cols and self._values == other._values
        return NotImplemented

    def __hash__(self):
        return hash((tuple(self._cols), self._values))

    def __repr__(self):
        return f"<Row {dict(zip(self._cols, self._values))!r}>"


class Cursor:
    def __init__(self, result=None, row_factory=None):
        result = result or {}
        cols = [c.get("name") for c in result.get("cols") or []]
        self._rows = [Row(cols, [decode_value(v) for v in r]) for r in result.get("rows") or []]
        if row_factory not in (None, sqlite3.Row):
            self._rows = [row_factory(self, tuple(r)) for r in self._rows]
        self._pos = 0
        self.description = tuple((c, None, None, None, None, None, None) for c in cols) or None
        rid = result.get("last_insert_rowid")
        self.lastrowid = int(rid) if rid not in (None, "") else None
        self.rowcount = -1

    def fetchone(self):
        if self._pos >= len(self._rows):
            return None
        self._pos += 1
        return self._rows[self._pos - 1]

    def fetchmany(self, size=1):
        out = self._rows[self._pos:self._pos + size]
        self._pos += len(out)
        return out

    def fetchall(self):
        out = self._rows[self._pos:]
        self._pos = len(self._rows)
        return out

    def __iter__(self):
        while True:
            r = self.fetchone()
            if r is None:
                return
            yield r

    def close(self):
        pass


# One kept-alive HTTP(S) connection per thread and host, shared by every TursoConnection on that thread
# (server.connect() makes a new TursoConnection per operation, so a per-instance connection would not
# help). Each statement then costs one round trip, not TCP + TLS setup plus a round trip.
_local = threading.local()
_STALE = (http.client.RemoteDisconnected, ConnectionResetError, ConnectionAbortedError, BrokenPipeError)


class _Pool(dict):
    """A thread's connections; closed when the thread ends (its threading.local data is freed)."""

    def __del__(self):
        for c in list(self.values()):
            try:
                c.close()
            except Exception:
                pass


def _pool():
    pool = getattr(_local, "pool", None)
    if pool is None:
        pool = _local.pool = _Pool()
    return pool


def _drop(key):
    c = _pool().pop(key, None)
    if c is not None:
        c.close()


def _send(scheme, netloc, path, data, headers, timeout):
    """POST and read the whole response (error bodies too, so the connection stays usable). Retries once,
    on a fresh connection, only when a reused connection turns out to have been closed by the server.
    That replay is safe: a request on an open stream carries a baton that was spent, so the server
    rejects it rather than running it twice, and a request without a baton only opens a new stream."""
    key = (scheme, netloc)
    for attempt in (0, 1):
        pool = _pool()
        c = pool.get(key)
        if c is None:
            cls = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection
            c = pool[key] = cls(netloc, timeout=timeout)
        reused = c.sock is not None
        c.timeout = timeout
        if c.sock is not None:
            c.sock.settimeout(timeout)
        try:
            c.request("POST", path, body=data, headers=headers)
            r = c.getresponse()
            raw = r.read()
            if r.will_close:
                _drop(key)
            return r.status, raw
        except _STALE as e:
            _drop(key)
            if reused and attempt == 0:
                continue
            raise TursoOperationalError(f"Turso unreachable: {type(e).__name__}") from None
        except (OSError, http.client.HTTPException) as e:
            _drop(key)
            raise TursoOperationalError(f"Turso unreachable: {type(e).__name__}") from None


def _stmt(sql, params=()):
    stmt = {"sql": sql}
    if isinstance(params, dict):
        stmt["named_args"] = [{"name": k, "value": encode_value(v)} for k, v in params.items()]
    elif params:
        stmt["args"] = [encode_value(v) for v in params]
    return {"type": "execute", "stmt": stmt}


class TursoConnection:
    def __init__(self, url, token, timeout=15):
        self.url = http_url(url)
        self._token = token or ""
        self.timeout = timeout
        self.row_factory = None
        self._base = None          # base_url the server asked us to use for this stream
        self._baton = None
        self._in_tx = False
        self._foreign_keys = None  # None = leave server default; True/False = replay on each new stream
        self._closed = False

    # -------------------------------------------------- transport
    def _post(self, body):
        parts = urllib.parse.urlsplit((self._base or self.url).rstrip("/") + "/v2/pipeline")
        if parts.scheme not in ("http", "https"):
            raise TursoOperationalError(f"Turso URL scheme {parts.scheme!r} is not supported")
        path = parts.path + (f"?{parts.query}" if parts.query else "")
        data = json.dumps(body).encode("utf-8")
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}
        status, raw = _send(parts.scheme, parts.netloc, path, data, headers, self.timeout)
        if status >= 400:
            detail = ""
            try:
                detail = str(json.loads(raw.decode("utf-8")).get("message") or "")[:200]
            except Exception:
                pass
            raise TursoOperationalError(f"Turso HTTP {status}{(': ' + detail) if detail else ''}")
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise TursoOperationalError("Turso returned invalid JSON") from None

    def _pipeline(self, requests, on_stream):
        """Send requests; on_stream=True continues the open stream. Returns the results list."""
        if self._closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database.")
        body = {"baton": self._baton if on_stream else None, "requests": requests}
        try:
            resp = self._post(body)
        except sqlite3.Error:
            self._reset_stream()     # an HTTP error invalidates the stream
            raise
        self._baton = resp.get("baton")
        if resp.get("base_url"):
            self._base = resp["base_url"]
        if self._baton is None:
            self._base = None
            if self._in_tx:
                self._in_tx = False
        results = resp.get("results") or []
        if len(results) != len(requests):
            self._reset_stream()
            raise TursoOperationalError("Turso returned a malformed pipeline response")
        return results

    def _reset_stream(self):
        self._baton = None
        self._base = None
        self._in_tx = False

    def _fresh_prefix(self):
        if self._foreign_keys is None:
            return []
        return [_stmt(f"PRAGMA foreign_keys = {'ON' if self._foreign_keys else 'OFF'}")]

    @staticmethod
    def _check(result):
        if result.get("type") == "error":
            raise _error(result.get("error"))
        return result

    def _cursor(self, result, kind):
        res = ((result.get("response") or {}).get("result")) or {}
        cur = Cursor(res, self.row_factory)
        if kind in _DML:
            cur.rowcount = int(res.get("affected_row_count") or 0)
        return cur

    # -------------------------------------------------- sqlite3.Connection surface
    @property
    def in_transaction(self):
        return self._in_tx

    def execute(self, sql, params=()):
        kind = _first_keyword(sql)
        if kind == "PRAGMA":
            handled = self._pragma(sql)
            if handled is not None:
                return handled
        if self._in_tx:
            res = self._pipeline([_stmt(sql, params)], on_stream=True)
            return self._cursor(self._check(res[0]), kind)
        if kind in _DML:
            stmt = _stmt(sql, params)    # encode before sending, so a bad param sends nothing
            self._begin()
            res = self._pipeline([stmt], on_stream=True)
            return self._cursor(self._check(res[0]), kind)
        prefix = self._fresh_prefix()
        stmt = _stmt(sql, params)
        res = self._pipeline(prefix + [stmt, {"type": "close"}], on_stream=False)
        return self._cursor(self._check(res[len(prefix)]), kind)

    def _begin(self):
        """Open a stream and a transaction on it. Kept apart from the first write so a failed BEGIN
        can never let that write run (and autocommit) outside a transaction."""
        prefix = self._fresh_prefix()
        res = self._pipeline(prefix + [_stmt("BEGIN")], on_stream=False)
        try:
            for r in res:
                self._check(r)
        except sqlite3.Error:
            if self._baton:
                try:
                    self._pipeline([{"type": "close"}], on_stream=True)
                except sqlite3.Error:
                    pass
            self._reset_stream()
            raise
        if self._baton is None:
            raise TursoOperationalError("Turso closed the stream before the transaction started")
        self._in_tx = True

    def executemany(self, sql, seq_of_params):
        total, kind = 0, _first_keyword(sql)
        for params in seq_of_params:
            cur = self.execute(sql, params)
            total += max(cur.rowcount, 0)
        out = Cursor()
        out.rowcount = total if kind in _DML else -1
        return out

    def executescript(self, script):
        if self._in_tx:
            self.commit()
        prefix = self._fresh_prefix()
        res = self._pipeline(prefix + [{"type": "sequence", "sql": script}, {"type": "close"}], on_stream=False)
        self._check(res[len(prefix)])
        return Cursor()

    def commit(self):
        if not self._in_tx:
            return
        try:
            res = self._pipeline([_stmt("COMMIT"), {"type": "close"}], on_stream=True)
        finally:
            self._reset_stream()
        self._check(res[0])

    def rollback(self):
        if not self._in_tx:
            return
        try:
            self._pipeline([_stmt("ROLLBACK"), {"type": "close"}], on_stream=True)
        finally:
            self._reset_stream()

    def close(self):
        if self._closed:
            return
        try:
            self.rollback()
        except Exception:
            pass
        finally:
            self._reset_stream()
            self._closed = True

    def cursor(self):
        raise sqlite3.NotSupportedError("use conn.execute()")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        return False

    # -------------------------------------------------- PRAGMAs libSQL treats differently
    def _pragma(self, sql):
        m = _PRAGMA.match(sql)
        if not m:
            return None
        name, value = m.group(1).lower(), m.group(2)
        if name == "journal_mode":
            return Cursor()
        if name == "foreign_keys" and value is not None:
            # replayed at the start of every new stream (the next transaction or standalone statement)
            self._foreign_keys = value.strip().strip("'\"").lower() in ("on", "1", "true", "yes")
            return Cursor()
        if name == "user_version":
            if value is None:
                try:
                    row = self.execute("SELECT version FROM schema_meta LIMIT 1").fetchone()
                except sqlite3.OperationalError as e:
                    if "no such table" not in str(e).lower():
                        raise
                    row = None
                return Cursor({"cols": [{"name": "user_version"}],
                               "rows": [[encode_value(int(row[0]) if row else 0)]]})
            n = int(value.strip())
            stmts = [_stmt("CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)"),
                     _stmt("DELETE FROM schema_meta"),
                     _stmt("INSERT INTO schema_meta (version) VALUES (?)", (n,))]
            own = not self._in_tx           # like sqlite: outside a transaction it takes effect at once
            if own:
                self._begin()
            for r in self._pipeline(stmts, on_stream=True):
                self._check(r)              # on error the transaction stays open; close() rolls it back
            if own:
                self.commit()
            return Cursor()
        return None
