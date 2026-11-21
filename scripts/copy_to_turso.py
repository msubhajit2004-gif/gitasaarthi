"""Copy a local GitaSaarthi SQLite database into Turso (the move to hosting; can be re-run, see below).

    python scripts/copy_to_turso.py --src data/gitasaarthi.db --old-key data/secret.key [--dry-run]

Reads TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and GITASAARTHI_MASTER_KEY (the NEW key, base64 of 32 bytes) from the
environment and refuses to run if any is missing.

Copies users, user_data, events and user_secrets, keeping primary keys so foreign keys line up. Each saved
secret is decrypted with the old key file and re-encrypted with the new master key; a blob that does not
decrypt is skipped (counted as secrets_skipped), never copied raw. Sessions and throttle rows are not copied,
so everyone signs in again on the hosted site. --dry-run reads and counts only.

Re-running is safe once the hosted site is live, because the destination wins:
- Before writing anything, every source account is checked against the destination: a destination row with
  the same id must have the same email (ignoring case), and the same email must have the same id. Events with
  the same id must be the same event (user, type, time). On any mismatch (an id taken by a hosted signup)
  the run refuses and writes nothing; the message names ids only. --dry-run runs the same check.
- users and events already on the destination are left alone (a password or role changed there stays).
- user_data and user_secrets rows are updated only when the source row's updated_at is newer.
- A row this script copied before that is gone from the destination now (an account deleted on the hosted
  site, with all its rows, or a Gemini key removed there) is not copied again. The destination table
  copy_ledger records what was copied; the count deleted_on_destination says how many were left out.
- Rows are never REPLACEd (that would cascade-delete destination rows such as sessions).

Prints counts only: never emails, password hashes, keys or journal text.
"""
import argparse
import base64
import binascii
import os
import pathlib
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import server  # noqa: E402

REQUIRED_ENV = ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GITASAARTHI_MASTER_KEY")

# table -> (columns, primary key columns); order matters: users first, so child rows find their parents.
TABLES = (
    ("users", ("id", "email", "name", "password_hash", "role", "created_at", "last_active_at"), ("id",)),
    ("user_data", ("user_id", "key", "value", "updated_at"), ("user_id", "key")),
    ("events", ("id", "user_id", "type", "topic", "created_at", "reviewed_at", "reviewed_by"), ("id",)),
    ("user_secrets", ("user_id", "name", "value", "updated_at"), ("user_id", "name")),
)


def decode_master_key(b64):
    """32 raw bytes from base64. ValueError (never echoing the value) otherwise."""
    try:
        key = base64.b64decode((b64 or "").strip(), validate=True)
    except (binascii.Error, ValueError, TypeError):
        raise ValueError("new master key is not valid base64") from None
    if len(key) != 32:
        raise ValueError(f"new master key must decode to exactly 32 bytes (got {len(key)})")
    return key


def read_old_key(path):
    """The old key file's raw bytes. Deliberately not server.load_master_key(): that prefers
    GITASAARTHI_MASTER_KEY, which here holds the NEW key."""
    with open(path, "rb") as f:
        key = f.read()
    if len(key) != 32:
        raise ValueError(f"old key file must be exactly 32 bytes (got {len(key)})")
    return key


def open_source(path):
    """Read-only SQLite; never server.connect(), which routes to Turso when TURSO_DATABASE_URL is set."""
    if not os.path.isfile(path):
        raise FileNotFoundError(f"source database not found: {path}")
    return sqlite3.connect(pathlib.Path(path).resolve().as_uri() + "?mode=ro", uri=True)


class CopyConflict(ValueError):
    """The destination already holds a different account or event under a source id."""


# tables whose destination rows are only replaced by a newer source row; the rest are insert-only
NEWER_WINS = {"user_data", "user_secrets"}


def upsert_sql(table, cols, pk):
    names = ", ".join(cols)
    marks = ", ".join("?" for _ in cols)
    head = f"INSERT INTO {table} ({names}) VALUES ({marks}) ON CONFLICT ({', '.join(pk)}) "
    if table not in NEWER_WINS:
        return head + "DO NOTHING"
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in pk)
    return head + f"DO UPDATE SET {updates} WHERE excluded.updated_at > {table}.updated_at"


def _dst_rows(conn, sql):
    try:
        return conn.execute(sql).fetchall()
    except sqlite3.OperationalError as e:
        if "no such table" in str(e).lower():
            return []                      # first run, nothing there yet
        raise


def find_conflicts(conn, rows):
    """Ids (never emails) of source rows that would land on a different destination account or event."""
    out = []
    dst_users = _dst_rows(conn, "SELECT id, email FROM users")
    by_id = {r[0]: (r[1] or "").lower() for r in dst_users}
    by_email = {(r[1] or "").lower(): r[0] for r in dst_users}
    for uid, email, *_ in rows["users"]:
        email = (email or "").lower()
        if uid in by_id and by_id[uid] != email:
            out.append(f"user id {uid} has a different email on the destination (another account, or an "
                       f"email changed there)")
        elif email in by_email and by_email[email] != uid:
            out.append(f"user id {uid} has the same email as destination account id {by_email[email]}")
    dst_events = {r[0]: tuple(r[1:]) for r in _dst_rows(conn, "SELECT id, user_id, type, created_at FROM events")}
    for eid, user_id, etype, _topic, created_at, *_ in rows["events"]:
        if eid in dst_events and dst_events[eid] != (user_id, etype, created_at):
            out.append(f"event id {eid} is a different event on the destination")
    return out


def refuse_on_conflicts(conn, rows):
    conflicts = find_conflicts(conn, rows)
    if conflicts:
        shown = "; ".join(conflicts[:10]) + ("; ..." if len(conflicts) > 10 else "")
        raise CopyConflict(f"{len(conflicts)} source row(s) clash with rows already on the destination, so "
                           f"nothing was written: {shown}. Resolve them by hand before re-running.")


LEDGER = "CREATE TABLE IF NOT EXISTS copy_ledger (tbl TEXT NOT NULL, k TEXT NOT NULL, PRIMARY KEY (tbl, k));"


def row_key(cols, pk, row):
    return "|".join(str(row[cols.index(c)]) for c in pk)


def drop_deleted_on_destination(conn, rows):
    """Leave out rows an earlier run copied that are gone from the destination now (an account deleted
    on the hosted site, a Gemini key removed there), and every row of a deleted account, so a re-run
    never brings them back. Returns (rows, how many were left out)."""
    ledger = {}
    for tbl, k in _dst_rows(conn, "SELECT tbl, k FROM copy_ledger"):
        ledger.setdefault(tbl, set()).add(k)
    out, dropped, gone_users = {}, 0, set()
    for t, cols, pk in TABLES:
        present = {"|".join(str(v) for v in r) for r in _dst_rows(conn, f"SELECT {', '.join(pk)} FROM {t}")}
        was_copied = ledger.get(t, set())
        keep = []
        for r in rows[t]:
            k = row_key(cols, pk, r)
            uid = r[cols.index("user_id")] if "user_id" in cols else None
            if (k in was_copied and k not in present) or uid in gone_users:
                dropped += 1
                if t == "users":
                    gone_users.add(r[0])
                continue
            if t == "events" and r[cols.index("reviewed_by")] in gone_users:
                r = r[:cols.index("reviewed_by")] + (None,) + r[cols.index("reviewed_by") + 1:]
            keep.append(r)
        out[t] = keep
    return out, dropped


def init_schema(conn):
    """server.init_db() for an open connection (it takes a path), plus this script's copy_ledger: the
    keys of every row it has copied, so a re-run can tell 'deleted on the destination' from 'new'.
    journal_mode is local-only, so skipped."""
    conn.executescript(server.SCHEMA + LEDGER)
    conn.execute(f"PRAGMA user_version = {server.SCHEMA_VERSION}")
    conn.commit()


def copy(src_sqlite_path, dst_conn, old_key_path, new_master_key_b64, dry_run=False):
    """Copy src into dst_conn (sqlite3 or db_turso.TursoConnection). Returns counts per table plus
    secrets_skipped. With dry_run, nothing is written to dst_conn (not even the schema)."""
    new_key = decode_master_key(new_master_key_b64)
    old_key = read_old_key(old_key_path)

    # every source read happens before any destination write
    src = open_source(src_sqlite_path)
    try:
        rows = {t: src.execute(f"SELECT {', '.join(cols)} FROM {t} ORDER BY {', '.join(pk)}").fetchall()
                for t, cols, pk in TABLES}
    finally:
        src.close()

    skipped = 0
    secrets_out = []
    for user_id, name, value, updated_at in rows["user_secrets"]:
        plain = server.decrypt_secret(value, old_key)
        if plain is None:
            skipped += 1
            continue
        secrets_out.append((user_id, name, server.encrypt_secret(plain, new_key), updated_at))
    rows["user_secrets"] = secrets_out

    if dry_run:
        refuse_on_conflicts(dst_conn, rows)    # read-only
        rows, deleted = drop_deleted_on_destination(dst_conn, rows)
    else:
        init_schema(dst_conn)
        try:
            # a no-op write opens the transaction first, so the check and the writes see one state
            dst_conn.execute("UPDATE users SET id = id WHERE 0")
            refuse_on_conflicts(dst_conn, rows)
            rows, deleted = drop_deleted_on_destination(dst_conn, rows)
            for t, cols, pk in TABLES:
                if rows[t]:
                    dst_conn.executemany(upsert_sql(t, cols, pk), rows[t])
                    dst_conn.executemany("INSERT INTO copy_ledger (tbl, k) VALUES (?, ?) ON CONFLICT DO NOTHING",
                                         [(t, row_key(cols, pk, r)) for r in rows[t]])
            dst_conn.commit()
        except BaseException:
            dst_conn.rollback()
            raise

    counts = {t: len(rows[t]) for t, _, _ in TABLES}
    counts["secrets_skipped"] = skipped
    counts["deleted_on_destination"] = deleted

    print("DRY RUN: nothing written. Would copy:" if dry_run else "Copied:")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print("  sessions, throttle_events: not copied (everyone signs in again)")
    return counts


def main(argv=None):
    p = argparse.ArgumentParser(description="Copy a local GitaSaarthi SQLite database into Turso.")
    p.add_argument("--src", required=True, help="local SQLite database, e.g. data/gitasaarthi.db")
    p.add_argument("--old-key", required=True, help="the local key file that encrypted saved secrets")
    p.add_argument("--dry-run", action="store_true", help="read and count only; write nothing")
    args = p.parse_args(argv)

    missing = [k for k in REQUIRED_ENV if not os.environ.get(k, "").strip()]
    if missing:
        raise SystemExit("Refusing to run: set these environment variables first: " + ", ".join(missing) + ".")

    import db_turso
    try:
        decode_master_key(os.environ["GITASAARTHI_MASTER_KEY"])
        read_old_key(args.old_key)
        dst = db_turso.TursoConnection(os.environ["TURSO_DATABASE_URL"], os.environ["TURSO_AUTH_TOKEN"])
    except (OSError, ValueError) as e:
        raise SystemExit(f"Refusing to run: {e}") from None
    try:
        dst.execute("PRAGMA foreign_keys = ON")
        copy(args.src, dst, args.old_key, os.environ["GITASAARTHI_MASTER_KEY"], dry_run=args.dry_run)
    except (OSError, ValueError, sqlite3.Error) as e:
        raise SystemExit(f"Copy failed, nothing committed: {type(e).__name__}: {e}") from None
    finally:
        dst.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
