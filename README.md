# GitaSaarthi

GitaSaarthi is a small website where you talk through stress, worry or sadness and get a verse from the Bhagavad Gita plus a short CBT exercise. It is a space for reflection. It is not medical care and does not replace a doctor, a therapist or emergency help.

It is served by `server.py`, a single Python program with no packages to install. Pages are plain HTML, CSS and JavaScript.

## Accounts

An account (name, email, password) is required. You sign up on the first page. Passwords are stored as scrypt hashes, never in plain text. You can change your name in Settings, under Account.

## What is stored

Per account, in a local SQLite database (`data/gitasaarthi.db`):

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

    python -m unittest tests/test_server.py
    node --test tests/*.test.js

## Deploying

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
