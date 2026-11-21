"""Vercel entry point. Every path (vercel.json routes /(.*) here) is served by server.Handler, so page
gating, CSP and the other headers stay in Python.

Vercel builds its own http.server around `handler`, so the attributes build_server would set (db_path,
throttle) are attached to that server on the first request, after a one-time init_db. The init runs under
a lock, and a failure is not cached: the next request tries again and the failed one gets a 503."""
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if os.environ.get("VERCEL"):
    # The deployment directory is read-only and the data lives in Turso; init_db still creates the
    # directory of the (unused) local path, so point it somewhere writable. Must precede `import server`.
    os.environ.setdefault("GITASAARTHI_DB", "/tmp/gitasaarthi/unused.db")

import server  # noqa: E402

_LOCK = threading.Lock()
_STATE = {}


def ensure_ready():
    """One-time startup, the same steps as server.build_server minus binding a port."""
    if _STATE.get("ready"):
        return _STATE
    with _LOCK:
        if _STATE.get("ready"):
            return _STATE
        server.require_runtime_env()
        db_path = server.DEFAULT_DB
        server.init_db(db_path)
        server.purge_expired_sessions(db_path)
        _STATE.update(db_path=db_path, throttle=server.Throttle(db_path))
        _STATE["ready"] = True
        return _STATE


class handler(server.Handler):
    def parse_request(self):
        if not super().parse_request():
            return False
        try:
            state = ensure_ready()
        except (Exception, SystemExit) as e:   # SystemExit from require_runtime_env included: answer, don't die
            sys.stderr.write(f"[GitaSaarthi] startup failed: {type(e).__name__}: {e}\n")
            self.send_error(503, "GitaSaarthi is starting up. Try again in a moment.")
            return False
        if getattr(self.server, "db_path", None) != state["db_path"]:
            self.server.db_path = state["db_path"]
        if getattr(self.server, "throttle", None) is not state["throttle"]:
            self.server.throttle = state["throttle"]
        return True
