# GitaSaarthi

**Live site: https://gitasaarthi-gray.vercel.app**

GitaSaarthi is a small website where you talk through stress, worry or sadness and get a verse from the Bhagavad Gita plus a short CBT exercise. It is a space for reflection. It is not medical care and does not replace a doctor, a therapist or emergency help.

It is served by `server.py`, a single Python program with no packages to install. Pages are plain HTML, CSS and JavaScript.

## Accounts

An account (name, email, password) is required. You sign up on the first page. Passwords are stored as scrypt hashes, never in plain text. You can change your name in Settings, under Account.

## What is stored

Per account, in a local SQLite database (`data/gitasaarthi.db`) when you run it yourself, or in a Turso database when it is deployed on Vercel:

- Journal entries, mood check-ins and breathing/practice history.
- The last topic you chose.
- Conversation and crisis events, recorded by topic only. Message text is not stored. Admins can see these events together with the user's name and email.

Browser-only settings (voice speed, music volume) stay in your browser.

## Optional Gemini key

Settings has an optional switch to use Google Gemini for open-ended answers. When it is on, your messages pass through this server to Google. The key you enter is stored on the server, encrypted at rest with your account, and is never sent back to the browser. You can remove it in Settings, and deleting the account removes it too. With it off, no message leaves this server.

## Quickstart

Requires Python 3.8 or newer built with OpenSSL scrypt support.

    python server.py

The server opens your browser. It listens on port 8000 and moves to 8001, 8002 and so on if that port is busy; the address it chose is printed at startup. Sign up on the first page.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| PORT | 8000 | First port to try. |
| GITASAARTHI_HOST | 127.0.0.1 | Address to bind. Use 0.0.0.0 only behind HTTPS. |
| GITASAARTHI_DB | data/gitasaarthi.db | Path to the SQLite database. |
| GITASAARTHI_SECURE_COOKIE | unset | Set to 1 to mark the session cookie Secure (needs HTTPS). |
| GITASAARTHI_TRUST_PROXY | unset | Set to 1 to trust forwarded headers from a reverse proxy. |
| GITASAARTHI_NO_BROWSER | unset | Set to 1 to skip opening a browser at startup. |
| GITASAARTHI_GEMINI_BASE | https://generativelanguage.googleapis.com | Base URL the server calls for Gemini (change for tests or a proxy). |
| GITASAARTHI_SECRET_KEY_FILE | data/secret.key | File holding the 32-byte master key that encrypts saved Gemini keys. Created on first use. |

## Admin

    python server.py --make-admin you@example.com
    python server.py --reset-password you@example.com

The account must already exist for `--make-admin`. Admins use `admin.html`.

## Backup and restore

    python server.py --backup backup.db

To restore, stop the server and copy the backup over `data/gitasaarthi.db`. Remove any `gitasaarthi.db-wal` and `-shm` files next to it first.

Back up `data/secret.key` together with the database. Without it, saved Gemini keys cannot be decrypted and users must enter them again. Keep that file private and never commit or share it.

## Testing

    python check.py

That runs every `tests/test_*.py` suite on SQLite, then the server suite again against a local Turso stub (`GITASAARTHI_TEST_BACKEND=turso-stub`), then the JS tests and a JS syntax check. The tests never use the network: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from your shell are ignored. One suite by hand:

    python -m unittest tests/test_server.py
    node --test tests/*.test.js

## Deploying to Vercel

The live site runs as one Vercel Python function (`api/index.py`) with its data in Turso. Local runs and the tests keep using SQLite.

Each saved item (journal, moods, practice, last) carries a revision number. `PUT /api/me/data/<key>` accepts an optional `base_rev`; if another device saved since, the server answers 409 with code `conflict`, the stored value and `rev`, and writes nothing. Existing databases gain the `rev` column automatically at start-up.

Put the database next to the function. `vercel.json` pins the function to `iad1` (Washington, D.C., AWS us-east-1); a Hobby project runs in one region. Each request makes several database round trips, so a Turso database on another continent makes every sign-in seconds slower. Run `turso db locations`, pick the location nearest Washington, D.C. (AWS us-east-1), and create the database there (for example in a group made with `turso group create <group> --location <code>`, then `turso db create <db> --group <group>`). If the database has to live elsewhere, change `regions` in `vercel.json` to the Vercel region nearest it.

Set these environment variables in the Vercel project:

| Variable | Meaning |
|---|---|
| TURSO_DATABASE_URL | The Turso database URL, from `turso db show <db> --url`. |
| TURSO_AUTH_TOKEN | A token for that database, from `turso db tokens create <db>`. |
| GITASAARTHI_MASTER_KEY | 32 random bytes, base64. Encrypts saved Gemini keys. Required; the site will not start without it. |
| GITASAARTHI_PUBLIC_ORIGIN | The site's address, for example `https://gitasaarthi-gray.vercel.app`. |
| GITASAARTHI_SECURE_COOKIE | Set to 1. |
| GITASAARTHI_ALLOWED_ORIGINS | Optional. More addresses allowed to send forms, such as a preview URL. |

Make a master key once and keep a copy somewhere private. If it is lost, saved Gemini keys cannot be read and users must enter them again.

    python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"

Add each variable, then deploy a preview, check it, and promote it:

    vercel env add TURSO_DATABASE_URL
    vercel env add TURSO_AUTH_TOKEN
    vercel env add GITASAARTHI_MASTER_KEY
    vercel env add GITASAARTHI_PUBLIC_ORIGIN
    vercel env add GITASAARTHI_SECURE_COOKIE
    vercel deploy
    vercel --prod

Back up the Turso database:

    turso db shell <db> .dump > backup.sql

To copy accounts from a local `data/gitasaarthi.db` into Turso, use `scripts/copy_to_turso.py`. Try a dry run first; see the script for its options. You can run it again later, and what is already on Turso wins. An account or event already there is left as it is. Journal, practice and saved-key rows are replaced only by a newer local row. An account deleted on Turso, or a saved key removed there, is not copied back. If a local id or email belongs to a different account on Turso (for example, someone signed up on the live site and got that id), the script refuses and writes nothing.

To make an admin on the live site, set the two Turso variables in your shell and run the usual command; it then works against Turso instead of the local file. The master key is not needed for this.

macOS or Linux:

    TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... python server.py --make-admin you@example.com

Windows PowerShell:

    $env:TURSO_DATABASE_URL = "..."; $env:TURSO_AUTH_TOKEN = "..."; python server.py --make-admin you@example.com

Both values are in the Vercel project (Settings, Environment Variables) or, after `vercel env pull .env.local`, in `.env.local`.

## Deploying behind your own proxy

- Serve over HTTPS and set `GITASAARTHI_SECURE_COOKIE=1`.
- Put a reverse proxy (nginx, Caddy) in front, keep the server on 127.0.0.1, and set `GITASAARTHI_TRUST_PROXY=1` so client addresses are read from the last `X-Forwarded-For` entry (the one your proxy adds). The proxy must overwrite or append to that header, and the scheme is not read from it.
- Back up the `data/` folder regularly, using `--backup` rather than copying a live database.

## Project layout

- `server.py`: the server and database code.
- `index.html`, `login.html`, `dashboard.html`, `admin.html`, `safe-harbor.html`: the pages.
- `js/`, `css/`, `audio/`, `images/`: assets.
- `tests/`: Python and Node tests.
- `DESIGN.md`: colours, fonts and spacing.
- `_archive/`: old tooling, screenshots and videos, not needed to run the site.
