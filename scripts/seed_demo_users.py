"""Add made-up demo people (Indian names, @example.org addresses) to a GitaSaarthi database so the admin panel looks lived-in.

    python scripts/seed_demo_users.py --target local --db demo-data/demo.db --count 35
    python scripts/seed_demo_users.py --target live --count 35 --dry-run --yes-write-production   (needs TURSO_* in the environment)
    python scripts/seed_demo_users.py --target live --count 35 --yes-write-production
    python scripts/seed_demo_users.py --target live --remove --yes-write-production

Demo people are recognised ONLY by an email ending in @example.org. They share one password hash and are not meant
to be signed in as. No messages or journals are written. Running again tops up to --count; --remove deletes exactly
the @example.org accounts (and their events and data) and nothing else. --target live needs --yes-write-production
and TURSO_DATABASE_URL + TURSO_AUTH_TOKEN exported by you; --target local refuses if TURSO_DATABASE_URL is set.
"""
import argparse
import json
import os
import random
import secrets
import sys
from datetime import timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

DOMAIN = "@example.org"
DEFAULT_DB = os.path.join(ROOT, "demo-data", "demo.db")

NAMES = [
    "Yash Rathore", "Rohan Handa", "Ramanuj Sahu", "Harsh Raj", "Aarav Sharma", "Vivaan Gupta", "Aditya Verma",
    "Arjun Nair", "Karthik Iyer", "Siddharth Menon", "Ishaan Kapoor", "Kabir Malhotra", "Rahul Yadav",
    "Amit Tiwari", "Vikram Singh", "Manish Patel", "Nikhil Joshi", "Pranav Deshmukh", "Saurabh Mishra",
    "Ankit Agarwal", "Priya Sharma", "Ananya Reddy", "Diya Mehta", "Meera Pillai", "Kavya Nambiar",
    "Neha Chauhan", "Pooja Bansal", "Riya Saxena", "Sneha Kulkarni", "Tanvi Bhatt", "Aishwarya Rao",
    "Divya Srinivasan", "Shruti Pandey", "Nisha Thakur", "Anjali Dubey", "Swati Jain", "Mohit Chaudhary",
    "Gaurav Bhardwaj", "Deepak Kumar", "Sanjay Mahajan", "Abhishek Pandit", "Varun Khanna", "Tarun Arora",
    "Lakshmi Venkatesh", "Ritika Goyal", "Pallavi Ghosh", "Sourav Banerjee", "Debjani Mukherjee",
    "Gurpreet Sandhu", "Harpreet Kaur", "Aryan Bose", "Ishita Das", "Rajat Sen", "Madhuri Kelkar",
    "Tushar Pawar", "Bhavna Solanki", "Yogesh Naik", "Sakshi Rawat", "Chirag Shah", "Komal Trivedi",
    "Naveen Reddy", "Jyoti Mishra", "Parth Vyas", "Rekha Nayak", "Suresh Pillai",
]
# the app's own feeling ids; the first ones are listed twice so they are chosen more often
TOPICS = ["anxiety", "anxiety", "anxiety", "overthinking", "overthinking", "overthinking", "burnout", "burnout",
          "burnout", "fear_of_failure", "heartbreak", "depression", "guilt", "anger", "purpose", "imposter", "grief",
          "jealousy", "loneliness", "perfectionism", "financial", "health", "workplace", "spiritual", "social_anxiety"]


def _iso(dt):
    return server.iso(dt)


def _slug(part):
    return "".join(ch for ch in part.lower() if "a" <= ch <= "z")


def _email(name, taken):
    first, *rest = name.split()
    base = f"{_slug(first)}.{_slug(rest[-1] if rest else first)}"
    email, n = f"{base}{DOMAIN}", 2
    while email in taken:
        email, n = f"{base}{n}{DOMAIN}", n + 1
    taken.add(email)
    return email


def _between(rng, lo, hi):
    return lo + timedelta(seconds=rng.randint(0, max(0, int((hi - lo).total_seconds()))))


def _person(rng, now):
    """(created, last_seen, quiet). Joined within 25 days; ~20% have not been back this week."""
    quiet = rng.random() < 0.2
    days = rng.randint(9, 24) if quiet else rng.randint(0, 24)
    created = now - timedelta(days=days, hours=rng.randint(0, 23), minutes=rng.randint(0, 59)) - timedelta(hours=2)
    if quiet:
        last = _between(rng, created + timedelta(hours=1), now - timedelta(days=7, hours=1))
    else:
        last = _between(rng, max(created + timedelta(hours=1), now - timedelta(days=6)), now)
    return created, max(last, created + timedelta(minutes=30)), quiet


def _date(dt):
    return dt.date().isoformat()


def _plan(rng, now, count, names, taken):
    """Everything to insert, decided up front so --dry-run and the real run agree."""
    people = []
    for name in names[:count]:
        created, last, quiet = _person(rng, now)
        convs = []
        for _ in range(rng.choice([0, 1, 2, 3, 3, 4, 5, 6, 8])):
            convs.append((rng.choice(TOPICS), _between(rng, created + timedelta(minutes=5), last)))
        first_day, last_day = created.date(), last.date()
        span = (last_day - first_day).days + 1
        streak = min(span, rng.choice([1, 2, 3, 3, 4, 5, 7, 9]))
        days = [_date(last - timedelta(days=k)) for k in range(streak)]
        if streak < span and rng.random() < 0.5:
            days += [_date(last - timedelta(days=streak + 1 + k)) for k in range(rng.randint(1, 4))
                     if streak + 1 + k < span]
        practice = sorted(set(days)) if rng.random() < 0.96 else []
        moods = {}
        if rng.random() < 0.8:
            for k in range(min(span, rng.randint(2, 9))):
                if k % 2 == 0 or rng.random() < 0.4:
                    moods[_date(last - timedelta(days=k))] = rng.randint(1, 5)
        people.append(dict(name=name, email=_email(name, taken), created=created, last=last, quiet=quiet,
                           convs=convs, practice=practice, moods=moods))
    return people


def _ids_in_use(conn):
    emails = {r[0].lower() for r in conn.execute("SELECT email FROM users").fetchall()}
    names = {(r[0] or "").lower() for r in conn.execute("SELECT name FROM users").fetchall()}
    existing = sum(1 for e in emails if e.endswith(DOMAIN))
    return emails, names, existing


def _require_target(args):
    url, token = os.environ.get("TURSO_DATABASE_URL"), os.environ.get("TURSO_AUTH_TOKEN")
    if args.target == "live":
        if not args.yes_write_production:
            raise SystemExit("Refusing: --target live changes the production database. Add --yes-write-production if you mean it.")
        if not (url and token):
            raise SystemExit("Refusing: --target live needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN set in the environment.")
        return None
    if url:
        raise SystemExit("Refusing: TURSO_DATABASE_URL is set, so this would hit the hosted database. "
                         "Unset it, or use --target live --yes-write-production on purpose.")
    return args.db or DEFAULT_DB


def _open(args, db):
    if db is not None and not os.path.exists(db) and not (args.dry_run or args.remove):
        server.init_db(db)                        # a fresh local file needs the tables
    if db is not None and not os.path.exists(db):
        return None                               # preview/remove on a file that does not exist yet: nothing there
    conn = server.connect(db or "")
    fk = conn.execute("PRAGMA foreign_keys").fetchone()
    if db is not None and fk is not None and int(fk[0]) != 1:
        conn.close()
        raise SystemExit("Refusing: foreign keys are not enforced on this connection.")
    return conn


def _remove(conn):
    ids = [r[0] for r in conn.execute("SELECT id FROM users WHERE lower(email) LIKE ?", (f"%{DOMAIN}",)).fetchall()]
    for uid in ids:   # explicit as well as ON DELETE CASCADE, so it also holds on a connection that ignores the pragma
        for table in ("events", "user_data", "sessions", "user_secrets"):
            conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM users WHERE id = ? AND lower(email) LIKE ?", (uid, f"%{DOMAIN}"))
    conn.commit()
    return len(ids)


def _insert(conn, people, rng, now):
    # One random secret per run, hashed and then forgotten: it is never stored or printed, so nobody can sign in as a
    # demo user (these accounts may sit on a live site).
    pw_hash = server.hash_password(secrets.token_urlsafe(32))
    admin = conn.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    admin_id = admin[0] if admin else None
    ids = []
    for p in people:
        conn.execute("INSERT INTO users (email, name, password_hash, role, created_at, last_active_at) VALUES (?,?,?,?,?,?)",
                     (p["email"], p["name"], pw_hash, "user", _iso(p["created"]), _iso(p["last"])))
        uid = conn.execute("SELECT id FROM users WHERE email = ?", (p["email"],)).fetchone()[0]
        ids.append(uid)
        for topic, when in p["convs"]:
            conn.execute("INSERT INTO events (user_id, type, topic, created_at) VALUES (?,?,?,?)",
                         (uid, "conversation", topic, _iso(when)))
        for key, value in (("practice", p["practice"]), ("moods", p["moods"])):
            if value:
                conn.execute("INSERT INTO user_data (user_id, key, value, updated_at, rev) VALUES (?,?,?,?,?)",
                             (uid, key, json.dumps(value), _iso(p["last"]), 1))
    # two safety alerts: one waiting for review, one already followed up by the first admin (if any)
    candidates = [(uid, p) for uid, p in zip(ids, people) if not p["quiet"]] or list(zip(ids, people))
    for (uid, p), reviewed in zip(rng.sample(candidates, min(2, len(candidates))), (False, True)):
        when = _between(rng, p["created"] + timedelta(minutes=10), p["last"])
        done = reviewed and admin_id is not None
        conn.execute("INSERT INTO events (user_id, type, topic, created_at, reviewed_at, reviewed_by) VALUES (?,?,?,?,?,?)",
                     (uid, "crisis_shown", None, _iso(when),
                      _iso(min(now, when + timedelta(hours=3))) if done else None, admin_id if done else None))
    conn.commit()
    return len(ids)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", choices=("local", "live"), required=True)
    ap.add_argument("--db", help="local SQLite file (default demo-data/demo.db); ignored for live")
    ap.add_argument("--count", type=int, default=35, help="total demo people wanted (counts existing @example.org), max %d" % len(NAMES))
    ap.add_argument("--seed", type=int, default=None, help="make the random choices repeatable")
    ap.add_argument("--dry-run", action="store_true", help="say what would be added and write nothing")
    ap.add_argument("--remove", action="store_true", help="delete exactly the users whose email ends with @example.org")
    ap.add_argument("--yes-write-production", action="store_true", help="required for --target live")
    args = ap.parse_args(argv)
    if not 1 <= args.count <= len(NAMES):
        raise SystemExit(f"--count must be between 1 and {len(NAMES)}")
    db = _require_target(args)
    conn = _open(args, db)
    summary = {"target": args.target, "existing_demo": 0, "added": 0, "would_add": 0, "removed": 0}
    try:
        if args.remove:
            if conn is not None:
                summary["removed"] = _remove(conn) if not args.dry_run else 0
            print(f"Removed {summary['removed']} {DOMAIN} users ({args.target}). Nobody else was touched.")
            return summary
        emails, taken_names, existing = _ids_in_use(conn) if conn is not None else (set(), set(), 0)
        summary["existing_demo"] = existing
        want = max(0, args.count - existing)
        names = [n for n in NAMES if n.lower() not in taken_names][:want]
        rng = random.Random(args.seed)
        now = server.now_utc()
        people = _plan(rng, now, len(names), names, set(emails))
        if args.dry_run:
            summary["would_add"] = len(people)
            print(f"Dry run ({args.target}): {existing} demo users already there, would add {len(people)}. Nothing written.")
            print("First names: " + ", ".join(p["name"] for p in people[:5]))
            return summary
        if people:
            summary["added"] = _insert(conn, people, rng, now)
        total = existing + summary["added"]
        print(f"Added {summary['added']} demo users ({args.target}); {total} {DOMAIN} users now. "
              "Their password is random and thrown away, so nobody can sign in as them.")
        return summary
    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    main()
