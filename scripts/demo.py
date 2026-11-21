"""A demo copy of GitaSaarthi with 50 made-up people (Indian names) and made-up activity.

    python scripts/demo.py              seed (if needed) and start the app on http://127.0.0.1:8010
    python scripts/demo.py --reset      throw the demo data away and make it again
    python scripts/demo.py --seed-only  make the data and stop

Everything lives in demo-data/ (never committed). It refuses to run against a hosted database, so your live
site and its real accounts are never touched. Sign in as admin@example.com or any demo person, all with the
password below; then open /admin.html as the admin.
"""
import argparse
import json
import os
import random
import subprocess
import sys
from datetime import timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

DEMO_PASSWORD = "demo-password-2026"
ADMIN_EMAIL = "admin@example.com"
DATA_DIR = os.path.join(ROOT, "demo-data")

NAMES = [
    "Yash Rathore", "Rohan Handa", "Ramanuj Sahu", "Harsh Raj", "Aarav Sharma", "Vivaan Gupta", "Aditya Verma",
    "Arjun Nair", "Karthik Iyer", "Siddharth Menon", "Ishaan Kapoor", "Kabir Malhotra", "Rahul Yadav",
    "Amit Tiwari", "Vikram Singh", "Manish Patel", "Nikhil Joshi", "Pranav Deshmukh", "Saurabh Mishra",
    "Ankit Agarwal", "Priya Sharma", "Ananya Reddy", "Diya Mehta", "Meera Pillai", "Kavya Nambiar",
    "Neha Chauhan", "Pooja Bansal", "Riya Saxena", "Sneha Kulkarni", "Tanvi Bhatt", "Aishwarya Rao",
    "Divya Srinivasan", "Shruti Pandey", "Nisha Thakur", "Anjali Dubey", "Swati Jain", "Mohit Chaudhary",
    "Gaurav Bhardwaj", "Deepak Kumar", "Sanjay Mahajan", "Abhishek Pandit", "Varun Khanna", "Tarun Arora",
    "Lakshmi Venkatesh", "Ritika Goyal", "Pallavi Ghosh", "Sourav Banerjee", "Debjani Mukherjee",
    "Gurpreet Sandhu", "Harpreet Kaur",
]
# the app's own feeling ids, so the admin panel shows their real names; the first ones are chosen most often
TOPICS = ["anxiety", "anxiety", "overthinking", "overthinking", "burnout", "burnout", "fear_of_failure",
          "heartbreak", "loneliness", "purpose", "guilt", "anger", "depression", "imposter", "perfectionism",
          "social_anxiety", "financial", "workplace", "grief"]


def _email(name, taken):
    base = ".".join(part.lower() for part in name.split())
    email, n = f"{base}@example.com", 2
    while email in taken:
        email, n = f"{base}{n}@example.com", n + 1
    taken.add(email)
    return email


def seed(db_path):
    """Fill db_path with the demo people and their activity. Replaces whatever demo data was there."""
    if os.environ.get("TURSO_DATABASE_URL") or os.environ.get("VERCEL"):
        raise SystemExit("demo.py only makes a local demo database; it will not touch a hosted one.")
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(db_path + suffix)
        except OSError:
            pass
    server.init_db(db_path)
    rng = random.Random(2026)
    now = server.now_utc()
    pw_hash = server.hash_password(DEMO_PASSWORD)     # one hash for everyone: the password is the same
    conn = server.connect(db_path)
    try:
        for table in ("events", "user_data", "sessions", "throttle_events", "user_secrets", "users"):   # a clean slate even if the file could not be deleted
            conn.execute(f"DELETE FROM {table}")
        taken = set()
        conn.execute("INSERT INTO users (email, name, password_hash, role, created_at, last_active_at) VALUES (?,?,?,?,?,?)",
                     (ADMIN_EMAIL, "Admin Demo", pw_hash, "admin", server.iso(now - timedelta(days=30)), server.iso(now)))
        taken.add(ADMIN_EMAIL)
        admin_id = conn.execute("SELECT id FROM users WHERE email=?", (ADMIN_EMAIL,)).fetchone()[0]
        people = []
        for name in NAMES:
            joined = rng.randint(1, 24)
            quiet = joined >= 9 and rng.random() < 0.4       # people who joined a while ago and have not been back this week
            last = rng.randint(8, joined) if quiet else rng.randint(0, min(joined, 6))
            created = now - timedelta(days=joined, hours=rng.randint(0, 22), minutes=rng.randint(0, 59))
            last_seen = now - timedelta(days=last, hours=rng.randint(0, 6), minutes=rng.randint(0, 59))
            if last_seen <= created:                          # never active before joining
                last_seen = min(now, created + timedelta(hours=rng.randint(1, 8)))
            conn.execute("INSERT INTO users (email, name, password_hash, role, created_at, last_active_at) VALUES (?,?,?,?,?,?)",
                         (_email(name, taken), name, pw_hash, "user", server.iso(created), server.iso(last_seen)))
            uid = conn.execute("SELECT id FROM users WHERE name=?", (name,)).fetchone()[0]
            people.append((uid, joined, last, created))

        for uid, joined, last, created in people:
            # conversations spread over the last two weeks (never before the person joined)
            for _ in range(rng.choice([0, 1, 2, 3, 3, 4, 5, 6, 8])):
                age = rng.randint(0, min(joined, 13))
                when = now - timedelta(days=age, hours=rng.randint(0, 22), minutes=rng.randint(0, 59))
                when = min(now, max(when, created + timedelta(minutes=rng.randint(5, 90))))   # never before they joined
                conn.execute("INSERT INTO events (user_id, type, topic, created_at) VALUES (?,?,?,?)",
                             (uid, "conversation", rng.choice(TOPICS), server.iso(when)))
            # a practice streak ending on the last day they were here, and a few mood check-ins
            end = last
            days = [(now - timedelta(days=end + k)).date().isoformat() for k in range(rng.choice([1, 2, 3, 3, 4, 5, 7, 9]))]
            if rng.random() < 0.5 and days:
                days += [(now - timedelta(days=end + len(days) + 2 + k)).date().isoformat() for k in range(rng.randint(1, 4))]
            if days and rng.random() < 0.96:
                conn.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?,?,?,?)",
                             (uid, "practice", json.dumps(sorted(set(days))), server.iso(now)))
            if rng.random() < 0.8:
                moods = {(now - timedelta(days=end + k)).date().isoformat(): rng.randint(1, 5) for k in range(rng.randint(2, 9)) if k % 2 == 0 or rng.random() < 0.4}
                conn.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?,?,?,?)",
                             (uid, "moods", json.dumps(moods), server.iso(now)))

        # a few safety alerts: two waiting for review (one from today), two already followed up
        alerts = [(people[6], 0.2, False), (people[13], 1.6, False), (people[22], 3.4, True), (people[31], 5.1, True)]
        for (uid, _j, _l, created), ago, reviewed in alerts:
            when = min(now, max(now - timedelta(days=ago), created + timedelta(minutes=45)))   # never before they joined
            conn.execute("INSERT INTO events (user_id, type, topic, created_at, reviewed_at, reviewed_by) VALUES (?,?,?,?,?,?)",
                         (uid, "crisis_shown", None, server.iso(when),
                          server.iso(when + timedelta(hours=3)) if reviewed else None, admin_id if reviewed else None))
        conn.commit()
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="store_true", help="make the demo data again")
    ap.add_argument("--seed-only", action="store_true", help="make the data and stop")
    ap.add_argument("--port", type=int, default=8010)
    args = ap.parse_args()
    db = os.path.join(DATA_DIR, "demo.db")
    if args.reset or not os.path.exists(db):
        seed(db)
        print(f"Made {len(NAMES)} demo people and an admin in {db}")
    if args.seed_only:
        return
    env = {k: v for k, v in os.environ.items() if not k.startswith(("TURSO_", "VERCEL"))}
    env.update(PORT=str(args.port), GITASAARTHI_DB=db, GITASAARTHI_SECRET_KEY_FILE=os.path.join(DATA_DIR, "secret.key"),
               GITASAARTHI_NO_BROWSER="1", GITASAARTHI_HOST="127.0.0.1")
    print(f"\nDemo app:  http://127.0.0.1:{args.port}/login.html\n"
          f"Admin:     {ADMIN_EMAIL}   then open http://127.0.0.1:{args.port}/admin.html (or use the Admin link)\n"
          f"Any person: e.g. yash.rathore@example.com\n"
          f"Password for all of them: {DEMO_PASSWORD}\n"
          "Press Ctrl+C to stop. These accounts exist only in demo-data/, never on your live site.\n")
    try:
        subprocess.run([sys.executable, os.path.join(ROOT, "server.py")], cwd=ROOT, env=env)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
