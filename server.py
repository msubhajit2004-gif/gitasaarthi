#!/usr/bin/env python3
"""
GitaSaarthi (गीता सारथी) - local server with accounts.
Standard library only (Python 3.8+): http.server, sqlite3, hashlib.scrypt.

    python server.py                         run at http://localhost:8000
    python server.py --make-admin EMAIL      give an existing account the admin role
    python server.py --reset-password EMAIL  set a new password for an account
    python server.py --backup FILE           consistent copy of the database
    (add --db FILE to any of these to use another database)

What it does
- Serves only the site's pages and its css/ js/ images/ audio/ folders. Everything else is 404.
- Logged out: "/" opens the sign-in page. The app and dashboard need a session; admin.html needs the admin role.
- Accounts live in data/gitasaarthi.db. Passwords are scrypt hashes; sessions are random tokens whose
  SHA-256 is stored, carried in an HttpOnly SameSite=Lax cookie.
"""

import argparse
import base64
import getpass
import hashlib
import hmac
import http.server
import ipaddress
import json
import mimetypes
import os
import posixpath
import re
import secrets
import signal
import socketserver
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime, timedelta, timezone
import urllib.error
import urllib.request
from urllib.parse import parse_qs, quote, unquote, urlsplit

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

PORT = int(os.environ.get("PORT", 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.environ.get("GITASAARTHI_DB", os.path.join(DIRECTORY, "data", "gitasaarthi.db"))
SECURE_COOKIE = os.environ.get("GITASAARTHI_SECURE_COOKIE") == "1" or bool(os.environ.get("VERCEL"))   # set to 1 when served over https
DEFAULT_HOST = os.environ.get("GITASAARTHI_HOST", "127.0.0.1")        # loopback unless you opt in to more
TRUST_PROXY = os.environ.get("GITASAARTHI_TRUST_PROXY") == "1"        # believe X-Forwarded-For (behind a proxy only)

COOKIE = "gs_session"
SESSION_IDLE = timedelta(days=7)        # sliding expiry
SESSION_ABSOLUTE = timedelta(days=30)   # hard end, however active
MAX_BODY = 512 * 1024                   # the journal is the largest thing a user stores
LOGIN_WINDOW = 15 * 60
LOGIN_MAX_PER_ACCOUNT = 5
LOGIN_MAX_PER_IP = 30
SIGNUP_WINDOW = 60 * 60
SIGNUP_MAX_PER_IP = 60
MAX_SESSIONS_PER_USER = 10
MAX_COOKIE_VALUE = 200
MAX_LIMIT = 100
DEFAULT_LIMIT = 50
SCHEMA_VERSION = 2   # 2: user_secrets table (encrypted per-account Gemini key)
GEMINI_BASE = os.environ.get("GITASAARTHI_GEMINI_BASE", "https://generativelanguage.googleapis.com").rstrip("/")
GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"
GEMINI_TIMEOUT = 30
GEMINI_MAX_BODY = 256 * 1024
GEMINI_RATE = 30            # upstream calls per user per minute
GEMINI_KEY_RE = re.compile(r"[A-Za-z0-9_-]{20,400}")
GEMINI_MODEL_RE = re.compile(r"[A-Za-z0-9._-]{1,80}")
HASH_SEM = threading.BoundedSemaphore(4)  # scrypt is memory-hungry; never run more than 4 at once
CSP = ("default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; connect-src 'self'; "
       "img-src 'self' data:; media-src 'self'; script-src 'self'; frame-ancestors 'none'")
PERMISSIONS_POLICY = "microphone=(self)"
ERROR_CODES = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
               409: "conflict", 413: "too_large", 416: "bad_range", 429: "throttled", 500: "server_error",
               503: "unavailable"}

PUBLIC_PAGES = {"/login.html", "/safe-harbor.html", "/privacy.html"}
SIGNED_IN_PAGES = {"/index.html", "/dashboard.html"}
ADMIN_PAGES = {"/admin.html"}
STATIC_DIRS = {"css", "js", "images", "audio"}
DATA_KEYS = {"practice", "moods", "journal", "last"}
EVENT_TYPES = {"conversation", "crisis_shown"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
TOPIC_RE = re.compile(r"^[a-z_]{1,40}$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL,
  last_active_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('practice', 'moods', 'journal', 'last')),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS user_secrets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('conversation', 'crisis_shown')),
  topic TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS events_type_time ON events(type, created_at);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id);
CREATE TABLE IF NOT EXISTS throttle_events (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS throttle_events_lookup ON throttle_events(bucket, key, ts);
"""


# ---------------------------------------------------------------- helpers
def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat(timespec="seconds")


def parse_iso(s):
    return datetime.fromisoformat(s)


def audit(action, user_id=None, outcome="ok", detail="", ip=None):
    """One line per auth-relevant decision: who, what, outcome. Never passwords or tokens."""
    sys.stderr.write(f"[audit] {iso(now_utc())} action={action} user={user_id if user_id is not None else '-'} "
                     f"outcome={outcome}{(' ip=' + ip) if ip else ''}{(' ' + detail) if detail else ''}\n")


def utf8_ok(s):
    try:
        s.encode("utf-8")
        return True
    except UnicodeEncodeError:
        return False


def _reject_constant(name):
    raise ValueError(name)


def strict_loads(text):
    """json.loads that refuses NaN/Infinity (not valid JSON)."""
    return json.loads(text, parse_constant=_reject_constant)


def _valid_ip(value):
    try:
        return str(ipaddress.ip_address((value or "").strip()))
    except ValueError:
        return None


def pick_client_ip(peer, forwarded, trust, real_ip=None, vercel_forwarded=None, vercel=None):
    """The address throttles and audit lines use.
    On Vercel (env VERCEL, read per call) every request arrives from the platform proxy, which overwrites
    the client-supplied headers: x-real-ip, else the first x-vercel-forwarded-for entry, else the rightmost
    x-forwarded-for. Elsewhere x-forwarded-for counts only with GITASAARTHI_TRUST_PROXY=1, rightmost entry
    (the one our own proxy appended; earlier entries are client-supplied and can be spoofed)."""
    if vercel is None:
        vercel = bool(os.environ.get("VERCEL"))
    candidates = []
    if vercel:
        candidates.append(real_ip)
        if vercel_forwarded:
            candidates.append(vercel_forwarded.split(",")[0])
    if (vercel or trust) and forwarded:
        candidates.append(forwarded.split(",")[-1])
    for c in candidates:
        ip = _valid_ip(c)
        if ip:
            return ip
    return peer


ORIGIN_ENV = ("GITASAARTHI_PUBLIC_ORIGIN", "GITASAARTHI_ALLOWED_ORIGINS")   # comma-separated exact origins


def _normalize_origin(value):
    """'scheme://host[:port]' in lower case, or None when value is not an http(s) origin."""
    if not value or not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value.strip())
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc or parts.path not in ("", "/") \
            or parts.query or parts.fragment or "@" in parts.netloc:
        return None
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}"


def allowed_origins():
    """Origins accepted for writes besides the request's own Host (read per call): the public origin(s)
    from ORIGIN_ENV, plus https://$VERCEL_URL, the deployment URL Vercel sets on every build."""
    out = set()
    for name in ORIGIN_ENV:
        for item in os.environ.get(name, "").split(","):
            o = _normalize_origin(item)
            if o:
                out.add(o)
    vurl = os.environ.get("VERCEL_URL", "").strip()
    if vurl:
        o = _normalize_origin("https://" + vurl)
        if o:
            out.add(o)
    return out


def bind_warning(host, secure_cookie):
    if host in ("127.0.0.1", "localhost", "::1") or secure_cookie:
        return None
    return (f"Listening on {host or 'all interfaces'}, not just this computer. Serve it over https and set "
            "GITASAARTHI_SECURE_COOKIE=1, or sessions travel unprotected.")


def connect(db_path):
    if os.environ.get("TURSO_DATABASE_URL"):     # hosted: Turso over HTTP; db_path is not used
        import db_turso
        conn = db_turso.TursoConnection(os.environ["TURSO_DATABASE_URL"], os.environ.get("TURSO_AUTH_TOKEN", ""))
        conn.execute("PRAGMA foreign_keys = ON")
        return conn
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path):
    if not os.environ.get("TURSO_DATABASE_URL"):   # a hosted database needs no local folder, and Vercel's disk is read-only
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        conn.commit()
    finally:
        conn.close()


def hash_password(password):
    salt = secrets.token_bytes(16)
    n, r, p = 2 ** 14, 8, 1
    with HASH_SEM:
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=64 * 1024 * 1024, dklen=32)
    return f"scrypt${n}${r}${p}${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        with HASH_SEM:
            got = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                                 maxmem=64 * 1024 * 1024, dklen=len(bytes.fromhex(digest)))
        return hmac.compare_digest(got, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


# A real hash to compare against when the email is unknown, so both paths cost the same.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(12))


def token_hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def safe_next(value):
    """Only a path on this site: one leading slash, no scheme, no host, no backslash."""
    if not value or not isinstance(value, str):
        return "/dashboard.html"
    if not value.startswith("/") or value.startswith("//") or "\\" in value or ":" in value.split("?", 1)[0]:
        return "/dashboard.html"
    path = urlsplit(value).path
    if path not in SIGNED_IN_PAGES and path not in ADMIN_PAGES:
        return "/dashboard.html"
    return value


def set_role(db_path, email, role):
    if role not in ("user", "admin"):
        raise ValueError("role must be user or admin")
    conn = connect(db_path)
    try:
        cur = conn.execute("UPDATE users SET role = ? WHERE email = ?", (role, email))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def practice_streak(days):
    have = set(d for d in days if isinstance(d, str))
    d = now_utc().date()
    if d.isoformat() not in have:
        d -= timedelta(days=1)
    n = 0
    while d.isoformat() in have:
        n += 1
        d -= timedelta(days=1)
    return n


class Throttle:
    """Attempts per account and per IP inside a sliding window. An attempt is reserved *before* the
    expensive hash so parallel requests cannot all slip under the limit; success releases it.

    Throttle(db_path) keeps the attempts in the throttle_events table, so they survive a restart or a
    serverless cold start and are shared by every instance on the same database. Throttle() with no
    database keeps them in memory (one process only)."""

    MAX_KEYS = 5000
    KEEP = 24 * 3600          # global prune: rows older than this go, whatever their window
    PRUNE_EVERY = 10 * 60     # at most one global prune per instance per this many seconds

    def __init__(self, db_path=None):
        if db_path is None and os.environ.get("VERCEL"):
            raise RuntimeError("On Vercel the throttle must live in the database: use Throttle(db_path).")
        self.lock = threading.Lock()
        self.fails = {}
        self.db_path = db_path
        self._last_prune = 0.0

    @staticmethod
    def _split(k):
        bucket, _, key = k.partition(":")
        return bucket, key

    def _db(self, work):
        """Run work(conn) in one transaction that starts with a write, so on SQLite it holds the write
        lock and on Turso it runs on one stream inside BEGIN ... COMMIT."""
        conn = connect(self.db_path)
        try:
            out = work(conn)
            conn.commit()
            return out
        except BaseException:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            conn.close()

    def _db_reserve(self, keys_limits, window):
        def work(conn):
            t = time.time()
            for k, _ in keys_limits:     # per-key prune first: it opens the write transaction
                conn.execute("DELETE FROM throttle_events WHERE bucket = ? AND key = ? AND ts <= ?",
                             self._split(k) + (t - window,))
            if t - self._last_prune >= self.PRUNE_EVERY:
                conn.execute("DELETE FROM throttle_events WHERE ts <= ?", (t - self.KEEP,))
                self._last_prune = t
            for k, limit in keys_limits:
                n = conn.execute("SELECT COUNT(*) FROM throttle_events WHERE bucket = ? AND key = ? AND ts > ?",
                                 self._split(k) + (t - window,)).fetchone()[0]
                if n >= limit:
                    return False
            for k, _ in keys_limits:
                conn.execute("INSERT INTO throttle_events (bucket, key, ts) VALUES (?, ?, ?)", self._split(k) + (t,))
            return True
        with self.lock:
            return self._db(work)

    def _db_release(self, email, ip):
        def work(conn):
            conn.execute("DELETE FROM throttle_events WHERE bucket = ? AND key = ?",
                         self._split(self._key("acct:", email)))
            conn.execute("DELETE FROM throttle_events WHERE rowid = (SELECT rowid FROM throttle_events "
                         "WHERE bucket = ? AND key = ? ORDER BY ts DESC LIMIT 1)", self._split(self._key("ip:", ip)))
        with self.lock:
            self._db(work)

    @staticmethod
    def _key(prefix, value):
        return prefix + str(value)[:254]

    def _recent(self, key, window=LOGIN_WINDOW):
        cut = time.time() - window
        lst = [t for t in self.fails.get(key, []) if t > cut]
        if lst:
            self.fails[key] = lst
        else:
            self.fails.pop(key, None)
        return lst

    def _cap(self):
        if len(self.fails) <= self.MAX_KEYS:
            return
        for k in list(self.fails):
            self._recent(k, SIGNUP_WINDOW)
        extra = len(self.fails) - self.MAX_KEYS
        if extra > 0:
            for k in sorted(self.fails, key=lambda k: self.fails[k][-1])[:extra]:
                del self.fails[k]

    def _reserve(self, keys_limits, window):
        if self.db_path is not None:
            return self._db_reserve(keys_limits, window)
        with self.lock:
            if any(len(self._recent(k, window)) >= limit for k, limit in keys_limits):
                return False
            t = time.time()
            for k, _ in keys_limits:
                self.fails.setdefault(k, []).append(t)
            self._cap()
            return True

    def reserve(self, email, ip):
        return self._reserve([(self._key("acct:", email), LOGIN_MAX_PER_ACCOUNT),
                              (self._key("ip:", ip), LOGIN_MAX_PER_IP)], LOGIN_WINDOW)

    def release(self, email, ip):
        if self.db_path is not None:
            return self._db_release(email, ip)
        with self.lock:
            self.fails.pop(self._key("acct:", email), None)
            k = self._key("ip:", ip)
            if self.fails.get(k):
                self.fails[k].pop()
                if not self.fails[k]:
                    del self.fails[k]

    def reserve_signup(self, ip):
        return self._reserve([(self._key("signup:", ip), SIGNUP_MAX_PER_IP)], SIGNUP_WINDOW)


class ApiError(Exception):
    def __init__(self, status, message, code=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code or ERROR_CODES.get(status, "error")


def purge_sessions(conn):
    now = now_utc()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?",
                 (iso(now), iso(now - SESSION_IDLE)))
    conn.commit()


def purge_expired_sessions(db_path):
    conn = connect(db_path)
    try:
        purge_sessions(conn)
    finally:
        conn.close()


def backup_db(src, dest):
    """Consistent copy of a live database (sqlite3 online backup)."""
    s = sqlite3.connect(src)
    d = sqlite3.connect(dest)
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()


# ---------------------------------------------------------------- secrets at rest
_MASTER = {}
_MASTER_LOCK = threading.Lock()


def secret_key_path():
    return os.environ.get("GITASAARTHI_SECRET_KEY_FILE") or os.path.join(DIRECTORY, "data", "secret.key")


def _restrict_windows(path):
    if os.name != "nt":
        return
    try:
        user = os.environ.get("USERNAME")
        if user:
            subprocess.run(["icacls", path, "/inheritance:r", "/grant:r", f"{user}:F"],
                           capture_output=True, timeout=10, check=False)
    except Exception:
        pass   # best effort; never block startup


HOSTED_REQUIRED = ("GITASAARTHI_MASTER_KEY", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GITASAARTHI_PUBLIC_ORIGIN")


def _env_master_key():
    """The key from GITASAARTHI_MASTER_KEY (base64 of exactly 32 bytes), or None when it is not set.
    ValueError when it is set but wrong; the message never contains the value."""
    raw = os.environ.get("GITASAARTHI_MASTER_KEY")
    if raw is None:
        return None
    try:
        key = base64.b64decode(raw.strip(), validate=True)
    except (ValueError, TypeError):
        raise ValueError("GITASAARTHI_MASTER_KEY is not valid base64.") from None
    if len(key) != 32:
        raise ValueError(f"GITASAARTHI_MASTER_KEY must decode to exactly 32 bytes (got {len(key)}).")
    return key


def require_runtime_env():
    """Startup check. On Vercel (env VERCEL set) every hosted setting must be present, and a key file is
    never generated there. Anywhere, a GITASAARTHI_MASTER_KEY that is set must be valid. SystemExit otherwise."""
    if os.environ.get("VERCEL"):
        missing = [k for k in HOSTED_REQUIRED if not os.environ.get(k, "").strip()]
        if missing:
            raise SystemExit("GitaSaarthi will not start on Vercel without these environment variables: "
                             + ", ".join(missing) + ".")
    try:
        _env_master_key()
    except ValueError as e:
        raise SystemExit(f"GitaSaarthi will not start: {e} Generate one with: python -c \"import os,base64;"
                         "print(base64.b64encode(os.urandom(32)).decode())\"") from None


def load_master_key():
    """GITASAARTHI_MASTER_KEY when set (hosted). Otherwise 32 random bytes in data/secret.key (0600), created
    on first use; back it up with the database. On Vercel there is no key file: missing env is an error."""
    try:
        key = _env_master_key()
    except ValueError as e:
        raise RuntimeError(str(e)) from None
    if key is not None:
        return key
    if os.environ.get("VERCEL"):
        raise RuntimeError("GITASAARTHI_MASTER_KEY is required on Vercel; no key file is created there.")
    path = secret_key_path()
    with _MASTER_LOCK:
        if path in _MASTER:
            return _MASTER[path]
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(secrets.token_bytes(32))
            _restrict_windows(path)
        except FileExistsError:
            pass
        with open(path, "rb") as f:
            key = f.read()
        if len(key) != 32:
            raise RuntimeError("secret key file is not 32 bytes")
        _MASTER[path] = key
        return key


def _subkeys(master):
    return (hmac.new(master, b"gitasaarthi/enc", hashlib.sha256).digest(),
            hmac.new(master, b"gitasaarthi/mac", hashlib.sha256).digest())


def _keystream_xor(enc_key, nonce, data):
    out = bytearray()
    for i in range(0, len(data), 32):
        block = hmac.new(enc_key, nonce + (i // 32).to_bytes(8, "big"), hashlib.sha256).digest()
        out.extend(a ^ b for a, b in zip(data[i:i + 32], block))
    return bytes(out)


def encrypt_secret(text, master):
    enc_key, mac_key = _subkeys(master)
    nonce = secrets.token_bytes(16)
    ct = _keystream_xor(enc_key, nonce, text.encode("utf-8"))
    tag = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
    return "v1:" + base64.b64encode(nonce + ct + tag).decode("ascii")


def decrypt_secret(blob, master):
    """Plaintext, or None if the blob is malformed, tampered with, or from another key."""
    try:
        if not isinstance(blob, str) or not blob.startswith("v1:"):
            return None
        raw = base64.b64decode(blob[3:], validate=True)
        if len(raw) < 48:
            return None
        nonce, ct, tag = raw[:16], raw[16:-32], raw[-32:]
        enc_key, mac_key = _subkeys(master)
        if not hmac.compare_digest(tag, hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()):
            return None
        return _keystream_xor(enc_key, nonce, ct).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None


def get_gemini(conn, user_id):
    """The user's saved {apiKey, enabled, model} or None. A blob that fails its check counts as no key."""
    row = conn.execute("SELECT value FROM user_secrets WHERE user_id = ? AND name = 'gemini'", (user_id,)).fetchone()
    if not row:
        return None
    text = decrypt_secret(row["value"], load_master_key())
    if text is None:
        return None
    try:
        d = json.loads(text)
    except ValueError:
        return None
    if not isinstance(d, dict) or not isinstance(d.get("apiKey"), str):
        return None
    return d


def gemini_view(cfg):
    cfg = cfg or {}
    key = cfg.get("apiKey")
    return {"hasKey": bool(key), "keyHint": ("\u2026" + key[-4:]) if key else None,
            "enabled": bool(key) and bool(cfg.get("enabled")),
            "model": cfg.get("model") or GEMINI_DEFAULT_MODEL}


def gemini_request(key, method, path, body=None):
    """Call Google with the key in a header only. Returns (status, parsed_json_or_None, scrubbed_text).
    status 0 means the network failed. The key is scrubbed from everything returned."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(GEMINI_BASE + path, data=data, method=method,
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT) as r:
            status, raw = r.status, r.read(8 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            raw = e.read(1024 * 1024)
        except Exception:
            raw = b""
    except Exception:
        return 0, None, ""
    text = raw.decode("utf-8", errors="replace").replace(key, "[key]")
    try:
        parsed = json.loads(text)
    except ValueError:
        parsed = None
    return status, parsed, text


def google_message(parsed, default):
    err = parsed.get("error") if isinstance(parsed, dict) else None
    msg = err.get("message") if isinstance(err, dict) else None
    return msg[:500] if isinstance(msg, str) and msg else default


# ---------------------------------------------------------------- handler
def parse_range(header, size):
    """Single 'bytes=a-b' range. None = ignore the header, 'bad' = 416, else (start, end) inclusive."""
    m = re.fullmatch(r"bytes=(\d{0,18})-(\d{0,18})", (header or "").strip())
    if not m or not (m.group(1) or m.group(2)):
        return None
    a, b = m.groups()
    if not a:
        n = int(b)
        if n == 0 or size == 0:
            return "bad"
        return (max(size - n, 0), size - 1)
    start = int(a)
    end = int(b) if b else size - 1
    if b and end < start:
        return None
    if start >= size:
        return "bad"
    return (start, min(end, size - 1))


def valid_shape(key, value):
    if key == "practice":
        return isinstance(value, list) and all(isinstance(x, str) for x in value)
    if key in ("moods", "last"):
        return isinstance(value, dict)
    if key == "journal":
        return isinstance(value, list)
    return False


def page_params(query):
    qs = parse_qs(query)

    def num(name, default, hi):
        v = (qs.get(name) or [None])[0]
        if v is None:
            return default
        if not v.isascii() or not v.isdigit() or len(v) > 9:
            raise ApiError(400, "That paging value is not valid.")
        return min(int(v), hi)
    return max(1, num("limit", DEFAULT_LIMIT, MAX_LIMIT)), num("offset", 0, 10 ** 9)


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "GitaSaarthi"
    sys_version = ""
    timeout = 15   # a stalled client cannot hold a thread forever

    # -- plumbing
    @property
    def db_path(self):
        return self.server.db_path

    def client_ip(self):
        return pick_client_ip(self.client_address[0], self.headers.get("X-Forwarded-For"), TRUST_PROXY,
                              real_ip=self.headers.get("X-Real-IP"),
                              vercel_forwarded=self.headers.get("X-Vercel-Forwarded-For"))

    def audit(self, action, user_id=None, outcome="ok", detail=""):
        audit(action, user_id, outcome, detail, ip=self.client_ip())

    def log_message(self, fmt, *args):
        msg = re.sub(r"([?&]q=)[^&\s\"]*", r"\1-", fmt % args)   # never log what an admin searched for
        sys.stderr.write(f"[GitaSaarthi] {self.address_string()} - {msg}\n")

    def common_headers(self, cache="no-cache, no-store, must-revalidate"):
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Permissions-Policy", PERMISSIONS_POLICY)

    def send_json(self, status, obj, cookie=None):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, status, text, ctype="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.common_headers()
        self.end_headers()

    def error_page(self, status, name, fallback):
        try:
            with open(os.path.join(DIRECTORY, name), "rb") as f:
                body = f.read().decode("utf-8")
        except OSError:
            return self.send_text(status, fallback)
        self.send_text(status, body, "text/html; charset=utf-8")

    def not_found(self):
        self.error_page(404, "404.html", "Not found")

    def send_file(self, rel, static=False):
        full = os.path.realpath(os.path.join(DIRECTORY, rel.lstrip("/")))
        root = os.path.realpath(DIRECTORY)
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            return self.not_found()
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        st = os.stat(full)
        size = st.st_size
        start, end, status = 0, size - 1, 200
        etag = None
        cache = "no-cache, no-store, must-revalidate"
        if static:   # assets revalidate by ETag; pages and the API are never stored
            etag = f'"{st.st_mtime_ns:x}-{size:x}"'
            cache = "no-cache"
            inm = self.headers.get("If-None-Match")
            if inm and (inm.strip() == "*" or etag in [t.strip() for t in inm.split(",")]):
                self.send_response(304)
                self.send_header("ETag", etag)
                self.common_headers(cache)
                self.end_headers()
                return
            if rel.startswith("/audio/"):
                rng = self.headers.get("Range")
                if rng and self.headers.get("If-Range", etag) == etag:
                    parsed = parse_range(rng, size)
                    if parsed == "bad":
                        self.send_response(416)
                        self.send_header("Content-Range", f"bytes */{size}")
                        self.send_header("Content-Length", "0")
                        self.common_headers(cache)
                        self.end_headers()
                        return
                    if parsed:
                        start, end = parsed
                        status = 206
        length = end - start + 1 if size else 0
        with open(full, "rb") as f:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            if etag:
                self.send_header("ETag", etag)
            if static and rel.startswith("/audio/"):
                self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.common_headers(cache)
            self.end_headers()
            if self.command == "HEAD":
                return
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def clean_path(self):
        raw = unquote(urlsplit(self.path).path)
        if "\\" in raw or "\x00" in raw:
            return None
        norm = posixpath.normpath(raw)
        if raw.endswith("/") and norm != "/":
            norm += "/"
        # anything that tried to climb ("..") is refused outright
        if ".." in raw.split("/"):
            return None
        return norm

    def cookie_value(self):
        header = self.headers.get("Cookie", "")
        for part in header.split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE and v:
                if len(v) > MAX_COOKIE_VALUE or not v.isascii():
                    return None
                return v
        return None

    def session_cookie(self, token, max_age):
        attrs = [f"{COOKIE}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
        if SECURE_COOKIE:
            attrs.append("Secure")
        return "; ".join(attrs)

    # -- who is calling (fail closed: anything odd means "not signed in")
    def current_user(self, conn):
        token = self.cookie_value()
        if not token:
            return None
        row = conn.execute(
            "SELECT s.token_hash, s.last_seen_at, s.expires_at, u.id, u.name, u.email, u.role "
            "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", (token_hash(token),)).fetchone()
        if not row:
            return None
        now = now_utc()
        if parse_iso(row["expires_at"]) <= now or parse_iso(row["last_seen_at"]) + SESSION_IDLE <= now:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
            conn.commit()
            return None
        if now - parse_iso(row["last_seen_at"]) > timedelta(minutes=1):
            conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (iso(now), row["token_hash"]))
            conn.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (iso(now), row["id"]))
            conn.commit()
        return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}

    def start_session(self, conn, user_id):
        token = secrets.token_urlsafe(32)
        now = now_utc()
        purge_sessions(conn)
        conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)",
                     (token_hash(token), user_id, iso(now), iso(now), iso(now + SESSION_ABSOLUTE)))
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN "
                     "(SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)",
                     (user_id, user_id, MAX_SESSIONS_PER_USER))
        conn.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (iso(now), user_id))
        conn.commit()
        return self.session_cookie(token, int(SESSION_ABSOLUTE.total_seconds()))

    # -- verbs
    def do_GET(self):
        self.handle_request()

    def do_HEAD(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_PUT(self):
        self.handle_request()

    def do_PATCH(self):
        self.handle_request()

    def do_DELETE(self):
        self.handle_request()

    def handle_request(self):
        self._body_read = False
        path = self.clean_path()
        if path is None:
            return self.not_found()
        conn = connect(self.db_path)
        try:
            if path.startswith("/api/"):
                return self.handle_api(conn, path)
            if self.command not in ("GET", "HEAD"):
                return self.send_text(405, "Method not allowed")
            return self.handle_page(conn, path)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass   # the client went away; nothing to answer
        except Exception:  # never leak a traceback to the browser
            sys.stderr.write(f"[GitaSaarthi] ip={self.client_ip()} error on {self.command} {path}:\n{traceback.format_exc()}")
            try:
                if path.startswith("/api/"):
                    self.send_json(500, {"error": "Something went wrong on the server.", "code": "server_error"})
                else:
                    self.error_page(500, "500.html", "Something went wrong on the server.")
            except Exception:
                pass
        finally:
            conn.close()

    # -- pages and files
    def handle_page(self, conn, path):
        if path == "/healthz":
            try:
                conn.execute("SELECT 1").fetchone()
            except sqlite3.Error:
                return self.send_json(503, {"ok": False, "code": "unavailable"})
            return self.send_json(200, {"ok": True})
        if path == "/":
            if self.current_user(conn):
                return self.redirect("/dashboard.html")
            return self.redirect("/login.html")
        if path in PUBLIC_PAGES:
            return self.send_file(path)
        if path == "/favicon.ico":
            return self.send_file("/images/favicon.svg", static=True)
        if path in SIGNED_IN_PAGES or path in ADMIN_PAGES:
            user = self.current_user(conn)
            if not user:
                return self.redirect("/login.html?next=" + quote(path, safe=""))
            if path in ADMIN_PAGES and user["role"] != "admin":
                self.audit("admin_page", user["id"], "denied")
                return self.send_text(403, FORBIDDEN_PAGE, "text/html; charset=utf-8")
            return self.send_file(path)
        parts = path.strip("/").split("/")
        if len(parts) >= 2 and parts[0] in STATIC_DIRS and not any(p.startswith(".") for p in parts):
            return self.send_file(path, static=True)
        return self.not_found()

    # -- API
    def read_json(self, max_body=MAX_BODY):
        raw_len = (self.headers.get("Content-Length") or "0").strip()
        if not raw_len.isascii() or not raw_len.isdigit() or len(raw_len) > 12:
            raise ApiError(400, "The request was not valid.")
        length = int(raw_len)
        if length > max_body:
            self.drain_body()
            raise ApiError(413, "That is too large to save.")
        self._body_read = True
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            data = strict_loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError, RecursionError):
            raise ApiError(400, "The request was not valid JSON.")
        if not isinstance(data, dict):
            raise ApiError(400, "The request was not valid JSON.")
        return data

    def drain_body(self):
        """Read and drop a request body nobody read, before an error answer. Closing while the client is
        still sending makes it see a reset connection instead of the 413/403/401.
        Only for modest bodies; a huge declared length is abusive and gets the answer straight away,
        and a client that stops sending is given up on after one second."""
        if getattr(self, "_body_read", False):
            return
        self._body_read = True
        raw_len = (self.headers.get("Content-Length") or "0").strip()
        if not raw_len.isascii() or not raw_len.isdigit() or len(raw_len) > 12:
            return
        length = int(raw_len)
        if not 0 < length <= 2 * 1024 * 1024:
            return
        old_timeout = self.connection.gettimeout()
        try:
            self.connection.settimeout(1.0)
            left = length
            while left > 0:
                chunk = self.rfile.read(min(65536, left))
                if not chunk:
                    break
                left -= len(chunk)
        except OSError:
            pass
        finally:
            try:
                self.connection.settimeout(old_timeout)
            except OSError:
                pass

    def check_csrf(self):
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        same_host = bool(origin and host) and urlsplit(origin).netloc == host
        if ctype != "application/json" or not (same_host or _normalize_origin(origin) in allowed_origins()):
            self.audit("csrf", None, "denied", f"origin={origin!r}")
            raise ApiError(403, "This request was refused.")

    def handle_api(self, conn, path):
        try:
            if self.command in ("POST", "PUT", "PATCH", "DELETE"):
                self.check_csrf()
            route = (self.command, path)
            if route == ("POST", "/api/signup"):
                return self.api_signup(conn)
            if route == ("POST", "/api/login"):
                return self.api_login(conn)
            if route == ("POST", "/api/logout"):
                return self.api_logout(conn)

            user = self.current_user(conn)
            if not user:
                raise ApiError(401, "Please sign in.")
            if route == ("GET", "/api/me"):
                return self.send_json(200, user)
            if route == ("PATCH", "/api/me"):
                return self.api_rename_me(conn, user)
            if route == ("DELETE", "/api/me"):
                return self.api_delete_me(conn, user)
            if route == ("POST", "/api/me/password"):
                return self.api_change_password(conn, user)
            if route == ("POST", "/api/me/sessions/revoke"):
                return self.api_revoke_sessions(conn, user)
            if route == ("GET", "/api/me/data"):
                rows = conn.execute("SELECT key, value FROM user_data WHERE user_id = ?", (user["id"],)).fetchall()
                out = {}
                for r in rows:
                    try:
                        out[r["key"]] = strict_loads(r["value"])
                    except (ValueError, RecursionError):
                        self.audit("data_read", user["id"], "corrupt", f"key={r['key']}")
                return self.send_json(200, out)
            if self.command == "PUT" and path.startswith("/api/me/data/"):
                return self.api_put_data(conn, user, path.rsplit("/", 1)[1])
            if route == ("POST", "/api/events"):
                return self.api_event(conn, user)
            if path == "/api/me/gemini" and self.command in ("GET", "PUT", "DELETE"):
                return self.api_gemini_settings(conn, user)
            if route == ("POST", "/api/gemini/test"):
                return self.api_gemini_test(conn, user)
            if route == ("GET", "/api/gemini/models"):
                return self.api_gemini_models(conn, user)
            if route == ("POST", "/api/gemini/generate"):
                return self.api_gemini_generate(conn, user)

            if path.startswith("/api/admin/"):
                if user["role"] != "admin":           # role read from the DB on this request
                    self.audit("admin_api", user["id"], "denied", path)
                    raise ApiError(403, "This is for admins.")
                return self.api_admin(conn, user, path)
            raise ApiError(404, "Not found.")
        except ApiError as e:
            self.drain_body()
            return self.send_json(e.status, {"error": e.message, "code": e.code})

    def api_signup(self, conn):
        d = self.read_json()
        name, email, pw = d.get("name"), d.get("email"), d.get("password")
        name = name.strip() if isinstance(name, str) and utf8_ok(name) else ""
        email = email.strip().lower() if isinstance(email, str) and utf8_ok(email) else ""
        if not name or len(name) > 60:
            raise ApiError(400, "Tell us what to call you.")
        if len(email) > 254 or not EMAIL_RE.match(email):
            raise ApiError(400, "Enter an email like name@example.com.")
        if not isinstance(pw, str) or not utf8_ok(pw) or not (8 <= len(pw) <= 200):
            raise ApiError(400, "Use at least 8 characters.")
        ip = self.client_ip()
        if not self.server.throttle.reserve_signup(ip):
            self.audit("signup", None, "throttled")
            raise ApiError(429, "Too many new accounts from here. Try again later.")
        try:
            cur = conn.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?,?,?,?)",
                               (email, name, hash_password(pw), iso(now_utc())))
            conn.commit()
        except sqlite3.IntegrityError:
            self.audit("signup", None, "duplicate")
            raise ApiError(409, "An account with this email already exists. Sign in instead.")
        cookie = self.start_session(conn, cur.lastrowid)
        self.audit("signup", cur.lastrowid)
        return self.send_json(201, {"id": cur.lastrowid, "name": name, "email": email, "role": "user"}, cookie)

    def api_login(self, conn):
        d = self.read_json()
        email = d.get("email")
        email = email.strip().lower() if isinstance(email, str) and utf8_ok(email) else ""
        pw = d.get("password") if isinstance(d.get("password"), str) else ""
        ip = self.client_ip()
        if not self.server.throttle.reserve(email, ip):   # reserved before the hash; released on success
            self.audit("login", None, "throttled")
            raise ApiError(429, "Too many tries. Wait 15 minutes, then try again.")
        row = conn.execute("SELECT id, name, email, role, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        ok = verify_password(pw, row["password_hash"] if row else _DUMMY_HASH) and row is not None
        if not ok:
            self.audit("login", row["id"] if row else None, "failed")
            raise ApiError(401, "That email and password don't match an account.")
        self.server.throttle.release(email, ip)
        cookie = self.start_session(conn, row["id"])
        self.audit("login", row["id"])
        return self.send_json(200, {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}, cookie)

    def api_logout(self, conn):
        token = self.cookie_value()
        user_id = None
        if token:
            row = conn.execute("SELECT user_id FROM sessions WHERE token_hash = ?", (token_hash(token),)).fetchone()
            user_id = row["user_id"] if row else None
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
            conn.commit()
        self.audit("logout", user_id)
        return self.send_json(200, {"ok": True}, self.session_cookie("", 0))

    def api_delete_me(self, conn, user):
        pw = self.read_json().get("password")
        if not isinstance(pw, str) or not pw:
            raise ApiError(400, "Enter your password to confirm.")
        ip = self.client_ip()
        if not self.server.throttle.reserve(user["email"], ip):
            self.audit("delete_account", user["id"], "throttled")
            raise ApiError(429, "Too many tries. Wait 15 minutes, then try again.")
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(pw, row["password_hash"]):
            self.audit("delete_account", user["id"], "denied")
            raise ApiError(403, "That password isn't right.")
        self.server.throttle.release(user["email"], ip)
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))   # sessions, data and events cascade
        conn.commit()
        self.audit("delete_account", user["id"])
        return self.send_json(200, {"ok": True}, self.session_cookie("", 0))

    def api_rename_me(self, conn, user):
        name = self.read_json().get("name")
        name = name.strip() if isinstance(name, str) and utf8_ok(name) else ""
        if not name or len(name) > 60 or any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
            raise ApiError(400, "Enter a name of 1 to 60 characters.")
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user["id"]))
        conn.commit()
        self.audit("rename", user["id"])
        return self.send_json(200, dict(user, name=name))

    def api_change_password(self, conn, user):
        d = self.read_json()
        cur_pw, new_pw = d.get("current"), d.get("new")
        if not isinstance(cur_pw, str) or not cur_pw:
            raise ApiError(400, "Enter your current password.")
        if not isinstance(new_pw, str) or not utf8_ok(new_pw) or not 8 <= len(new_pw) <= 200:
            raise ApiError(400, "Use a new password of 8 to 200 characters.")
        ip = self.client_ip()
        if not self.server.throttle.reserve(user["email"], ip):
            self.audit("change_password", user["id"], "throttled")
            raise ApiError(429, "Too many tries. Wait 15 minutes, then try again.")
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(cur_pw, row["password_hash"]):
            self.audit("change_password", user["id"], "denied")
            raise ApiError(403, "That password isn't right.")
        self.server.throttle.release(user["email"], ip)
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_pw), user["id"]))
        keep = token_hash(self.cookie_value())
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], keep))
        conn.commit()
        self.audit("change_password", user["id"], "ok", f"revoked={cur.rowcount}")
        return self.send_json(200, {"ok": True})

    def api_revoke_sessions(self, conn, user):
        current = token_hash(self.cookie_value())
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], current))
        conn.commit()
        self.audit("revoke_sessions", user["id"], "ok", f"count={cur.rowcount}")
        return self.send_json(200, {"ok": True, "revoked": cur.rowcount})

    def api_put_data(self, conn, user, key):
        if key not in DATA_KEYS:
            raise ApiError(400, "Unknown item.")
        d = self.read_json()
        if "value" not in d:
            raise ApiError(400, "Nothing to save.")
        if not valid_shape(key, d["value"]):
            raise ApiError(400, "That does not look like the right kind of data.")
        try:
            text = json.dumps(d["value"], ensure_ascii=False, allow_nan=False)
            text.encode("utf-8")
        except (ValueError, RecursionError):
            raise ApiError(400, "That contains values that cannot be saved.")
        conn.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?,?,?,?) "
                     "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                     (user["id"], key, text, iso(now_utc())))
        conn.commit()
        return self.send_json(200, {"ok": True})

    # -- Gemini (the key lives encrypted on the server; the browser never sees it)
    def api_gemini_settings(self, conn, user):
        uid = user["id"]
        if self.command == "GET":
            return self.send_json(200, gemini_view(get_gemini(conn, uid)))
        if self.command == "DELETE":
            conn.execute("DELETE FROM user_secrets WHERE user_id = ? AND name = 'gemini'", (uid,))
            conn.commit()
            self.audit("gemini_key", uid, "removed")
            return self.send_json(200, {"ok": True})
        d = self.read_json()
        cfg = dict(get_gemini(conn, uid) or {})
        if "apiKey" in d:
            k = d["apiKey"]
            if not isinstance(k, str) or not GEMINI_KEY_RE.fullmatch(k):
                raise ApiError(400, "That does not look like a Gemini API key.")
            cfg["apiKey"] = k
        if "enabled" in d:
            if not isinstance(d["enabled"], bool):
                raise ApiError(400, "Enabled must be true or false.")
            cfg["enabled"] = d["enabled"]
        if "model" in d:
            if not isinstance(d["model"], str) or not GEMINI_MODEL_RE.fullmatch(d["model"]):
                raise ApiError(400, "That model name is not valid.")
            cfg["model"] = d["model"]
        if not cfg.get("apiKey"):
            raise ApiError(400, "Save your Gemini key first.")
        blob = encrypt_secret(json.dumps({"apiKey": cfg["apiKey"], "enabled": bool(cfg.get("enabled")),
                                          "model": cfg.get("model") or GEMINI_DEFAULT_MODEL}), load_master_key())
        conn.execute("INSERT INTO user_secrets (user_id, name, value, updated_at) VALUES (?, 'gemini', ?, ?) "
                     "ON CONFLICT(user_id, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                     (uid, blob, iso(now_utc())))
        conn.commit()
        self.audit("gemini_key", uid, "saved" if "apiKey" in d else "updated")
        return self.send_json(200, gemini_view(cfg))

    def gemini_ready(self, conn, user):
        """The saved config, after checking there is a key and the per-user rate limit."""
        cfg = get_gemini(conn, user["id"])
        if not cfg or not cfg.get("apiKey"):
            raise ApiError(400, "Add your Gemini key in Settings first.", "no_key")
        if not self.server.throttle._reserve([("gem:%d" % user["id"], GEMINI_RATE)], 60):
            self.audit("gemini", user["id"], "throttled")
            raise ApiError(429, "Too many Gemini requests. Wait a minute and try again.")
        return cfg

    def gemini_fail(self, status, parsed):
        if status == 0:
            raise ApiError(502, "Could not reach Google. Check your connection and try again.", "gemini_error")
        msg = google_message(parsed, "Google did not accept that request.")
        raise ApiError(400 if 400 <= status < 500 else 502, msg, "gemini_error")

    def api_gemini_test(self, conn, user):
        self.read_json()
        cfg = self.gemini_ready(conn, user)
        model = cfg.get("model") or GEMINI_DEFAULT_MODEL
        status, parsed, _ = gemini_request(
            cfg["apiKey"], "POST", f"/v1beta/models/{quote(model, safe='')}:generateContent",
            {"contents": [{"role": "user", "parts": [{"text": "Reply with OK"}]}],
             "generationConfig": {"maxOutputTokens": 16}})
        if status != 200:
            self.audit("gemini_test", user["id"], "failed", f"status={status}")
            self.gemini_fail(status, parsed)
        return self.send_json(200, {"ok": True})

    def api_gemini_models(self, conn, user):
        cfg = self.gemini_ready(conn, user)
        models, token = [], None
        for _ in range(5):
            q = "?pageSize=1000" + (f"&pageToken={quote(token, safe='')}" if token else "")
            status, parsed, _ = gemini_request(cfg["apiKey"], "GET", "/v1beta/models" + q)
            if status != 200:
                self.gemini_fail(status, parsed)
            if not isinstance(parsed, dict):
                self.gemini_fail(502, None)
            for m in parsed.get("models") or []:
                name = m.get("name") if isinstance(m, dict) else None
                if not isinstance(name, str) or "generateContent" not in (m.get("supportedGenerationMethods") or []):
                    continue
                mid = name[len("models/"):] if name.startswith("models/") else name
                if GEMINI_MODEL_RE.fullmatch(mid):
                    label = m.get("displayName")
                    models.append({"id": mid, "label": label if isinstance(label, str) and label else mid})
            token = parsed.get("nextPageToken")
            if not isinstance(token, str) or not token:
                break
        return self.send_json(200, {"models": models})

    def api_gemini_generate(self, conn, user):
        d = self.read_json(GEMINI_MAX_BODY)
        contents = d.get("contents")
        if not isinstance(contents, list) or not contents:
            raise ApiError(400, "Nothing to send.")
        body = {"contents": contents}
        for k in ("systemInstruction", "generationConfig"):
            if k in d:
                if not isinstance(d[k], dict):
                    raise ApiError(400, "The request was not valid.")
                body[k] = d[k]
        model = d.get("model")
        if model is not None and (not isinstance(model, str) or not GEMINI_MODEL_RE.fullmatch(model)):
            raise ApiError(400, "That model name is not valid.")
        cfg = self.gemini_ready(conn, user)
        model = model or cfg.get("model") or GEMINI_DEFAULT_MODEL
        status, parsed, _ = gemini_request(
            cfg["apiKey"], "POST", f"/v1beta/models/{quote(model, safe='')}:generateContent", body)
        if status == 200 and parsed is not None:
            return self.send_json(200, parsed)
        if 400 <= status < 500:
            if not isinstance(parsed, dict):
                parsed = {"error": {"message": "Google did not accept that request."}}
            return self.send_json(status, parsed)
        self.gemini_fail(status if status else 0, parsed if status else None)

    def api_event(self, conn, user):
        d = self.read_json()
        etype = d.get("type")
        topic = d.get("topic")
        if etype not in EVENT_TYPES:
            raise ApiError(400, "Unknown event.")
        if topic is not None and (not isinstance(topic, str) or not TOPIC_RE.match(topic)):
            raise ApiError(400, "Unknown topic.")
        conn.execute("INSERT INTO events (user_id, type, topic, created_at) VALUES (?,?,?,?)",
                     (user["id"], etype, topic, iso(now_utc())))
        conn.commit()
        return self.send_json(201, {"ok": True})

    def api_admin(self, conn, admin, path):
        now = now_utc()
        week = iso(now - timedelta(days=7))
        fortnight = iso(now - timedelta(days=14))
        query = urlsplit(self.path).query
        if self.command == "GET" and path == "/api/admin/stats":
            u = conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(created_at >= ?), 0), COALESCE(SUM(last_active_at >= ?), 0) FROM users",
                (week, week)).fetchone()
            e = conn.execute(
                "SELECT COALESCE(SUM(type='conversation' AND created_at >= ?), 0), "
                "COALESCE(SUM(type='conversation' AND created_at >= ? AND created_at < ?), 0), "
                "COALESCE(SUM(type='crisis_shown' AND created_at >= ?), 0), "
                "COALESCE(SUM(type='crisis_shown' AND created_at >= ? AND created_at < ?), 0), "
                "COALESCE(SUM(type='crisis_shown' AND reviewed_at IS NULL), 0) FROM events",
                (week, fortnight, week, week, fortnight, week)).fetchone()
            stats = {
                "users": u[0],
                "new_this_week": u[1],
                "active_this_week": u[2],
                "active_last_week": None,  # last_active_at keeps only the latest visit
                "conversations_this_week": e[0],
                "conversations_last_week": e[1],
                "crisis_this_week": e[2],
                "crisis_last_week": e[3],
                "unreviewed": e[4],
            }
            per_day = {r[0]: r[1] for r in conn.execute(
                "SELECT substr(created_at, 1, 10), COUNT(*) FROM events WHERE type='conversation' AND created_at >= ? GROUP BY 1",
                (iso(now - timedelta(days=28)),))}
            stats["per_day"] = [{"day": (now.date() - timedelta(days=i)).isoformat(),
                                 "n": per_day.get((now.date() - timedelta(days=i)).isoformat(), 0)} for i in range(27, -1, -1)]
            stats["topics"] = [{"topic": r[0], "n": r[1]} for r in conn.execute(
                "SELECT topic, COUNT(*) FROM events WHERE type='conversation' AND topic IS NOT NULL AND created_at >= ? "
                "GROUP BY topic ORDER BY 2 DESC LIMIT 8", (week,))]
            return self.send_json(200, stats)
        if self.command == "GET" and path == "/api/admin/users":
            limit, offset = page_params(query)
            q = (parse_qs(query).get("q") or [""])[0].strip()[:80]
            like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            rows = conn.execute(
                "SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_active_at, d.value AS practice "
                "FROM users u LEFT JOIN user_data d ON d.user_id = u.id AND d.key = 'practice' "
                "WHERE u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' ORDER BY u.created_at DESC, u.id DESC "
                "LIMIT ? OFFSET ?", (like, like, limit, offset)).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            out = []
            for r in rows:
                try:
                    days = strict_loads(r["practice"]) if r["practice"] else []
                except (ValueError, RecursionError):
                    days = []
                out.append({"id": r["id"], "name": r["name"], "email": r["email"], "role": r["role"],
                            "created_at": r["created_at"], "last_active_at": r["last_active_at"],
                            "streak": practice_streak(days if isinstance(days, list) else [])})
            return self.send_json(200, {"users": out, "total": total})
        if self.command == "GET" and path == "/api/admin/reviews":
            limit, offset = page_params(query)
            rows = conn.execute(
                "SELECT e.id, e.created_at, e.reviewed_at, u.name, u.email FROM events e JOIN users u ON u.id = e.user_id "
                "WHERE e.type = 'crisis_shown' ORDER BY (e.reviewed_at IS NULL) DESC, e.created_at DESC, e.id DESC LIMIT ? OFFSET ?",
                (limit, offset)).fetchall()
            counts = conn.execute("SELECT COUNT(*), COALESCE(SUM(reviewed_at IS NULL), 0) FROM events "
                                  "WHERE type = 'crisis_shown'").fetchone()
            return self.send_json(200, {"total": counts[0], "unreviewed": counts[1], "reviews": [{"id": r["id"], "created_at": r["created_at"], "name": r["name"],
                                                     "email": r["email"], "reviewed": r["reviewed_at"] is not None}
                                                    for r in rows]})
        m = re.fullmatch(r"/api/admin/reviews/(\d+)", path)
        if self.command == "POST" and m and len(m.group(1)) <= 18:
            eid = int(m.group(1))
            cur = conn.execute("UPDATE events SET reviewed_at = ?, reviewed_by = ? "
                               "WHERE id = ? AND type = 'crisis_shown' AND reviewed_at IS NULL",
                               (iso(now), admin["id"], eid))
            conn.commit()
            if not cur.rowcount and not conn.execute(
                    "SELECT 1 FROM events WHERE id = ? AND type = 'crisis_shown'", (eid,)).fetchone():
                raise ApiError(404, "Not found.")
            if cur.rowcount:
                self.audit("review", admin["id"], "ok", f"event={eid}")
            return self.send_json(200, {"ok": True})
        raise ApiError(404, "Not found.")


FORBIDDEN_PAGE = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admins only · GitaSaarthi</title><link rel="stylesheet" href="/css/site.css"></head>
<body><div class="page"><main class="auth"><h1>This page is for admins</h1>
<p>Your account can use the app and your dashboard. <a class="link gold" href="/dashboard.html">Back to your dashboard</a></p>
</main></div></body></html>"""


class GitaServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


def build_server(port, db_path=None, host=None):
    require_runtime_env()
    db_path = db_path or DEFAULT_DB
    host = DEFAULT_HOST if host is None else host
    init_db(db_path)
    purge_expired_sessions(db_path)
    httpd = GitaServer((host, port), Handler)
    httpd.db_path = db_path
    httpd.throttle = Throttle(db_path)
    return httpd


def install_sigterm(httpd):
    """SIGTERM stops serve_forever cleanly (shutdown() must run off the serving thread)."""
    def _stop(signum, frame):
        threading.Thread(target=httpd.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, _stop)


# ---------------------------------------------------------------- command line
def cli_make_admin(email, db=None):
    db = db or DEFAULT_DB
    init_db(db)
    if set_role(db, email.strip().lower(), "admin"):
        audit("make_admin", None, "ok", f"email={email}")
        print(f"{email} is now an admin.")
    else:
        print(f"No account with the email {email}. Create it on the sign-in page first.")
        sys.exit(1)


def cli_reset_password(email, db=None):
    db = db or DEFAULT_DB
    init_db(db)
    pw = getpass.getpass("New password (at least 8 characters): ")
    if len(pw) < 8 or pw != getpass.getpass("Type it again: "):
        print("The passwords did not match or were too short. Nothing changed.")
        sys.exit(1)
    conn = connect(db)
    try:
        cur = conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hash_password(pw), email.strip().lower()))
        if cur.rowcount:
            conn.execute("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)", (email.strip().lower(),))
        conn.commit()
    finally:
        conn.close()
    print("Password changed, and old sign-ins were ended." if cur.rowcount else f"No account with the email {email}.")


def cli_backup(dest, db=None):
    db = db or DEFAULT_DB
    if not os.path.isfile(db):
        print(f"No database at {db}.")
        sys.exit(1)
    backup_db(db, dest)
    print(f"Backed up {db} to {dest}.")


def run_server(db=None):
    db = db or DEFAULT_DB
    httpd, port = None, PORT
    for offset in range(10):
        try:
            httpd = build_server(PORT + offset, db)
            port = PORT + offset
            break
        except OSError:
            continue
    if not httpd:
        print(f"Error: Could not bind to port {PORT} or the next 9 ports.")
        sys.exit(1)
    host = DEFAULT_HOST
    url = f"http://{'localhost' if host in ('', '127.0.0.1', '0.0.0.0') else host}:{port}"
    print("=" * 70)
    print("  GitaSaarthi (गीता सारथी)")
    print("=" * 70)
    print(f"  Open      : {url}")
    print(f"  Accounts  : {db}")
    print("  Admin     : python server.py --make-admin you@example.com")
    print("  Stop      : Ctrl+C")
    warning = bind_warning(host, SECURE_COOKIE)
    if warning:
        print(f"  WARNING   : {warning}")
    print("=" * 70)
    install_sigterm(httpd)
    if os.environ.get("GITASAARTHI_NO_BROWSER") != "1":
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("\n[GitaSaarthi] Server stopped.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="GitaSaarthi local server")
    ap.add_argument("--make-admin", metavar="EMAIL")
    ap.add_argument("--reset-password", metavar="EMAIL")
    ap.add_argument("--backup", metavar="FILE", help="write a consistent copy of the database to FILE")
    ap.add_argument("--db", metavar="FILE", help="database file (default: data/gitasaarthi.db)")
    args = ap.parse_args()
    if args.make_admin:
        cli_make_admin(args.make_admin, args.db)
    elif args.reset_password:
        cli_reset_password(args.reset_password, args.db)
    elif args.backup:
        cli_backup(args.backup, args.db)
    else:
        run_server(args.db)
