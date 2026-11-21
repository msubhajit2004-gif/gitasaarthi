# Changelog

All notable changes to GitaSaarthi are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-11-20

First release.

### Added
- Accounts: sign up and sign in, passwords hashed with scrypt, server-side sessions, CSRF protection, and throttling of repeated failed sign-ins.
- Dashboard: a 28-day practice strip and a mood line.
- Admin view, including follow-up for crisis messages.
- Account settings: change password, sign out other devices, download your data, delete your account.
- Public privacy page and Safe Harbor page.
- Security headers and a Content Security Policy.
- Health endpoint at `/healthz`.
- Backup command for the database.
- Custom 404 and 500 error pages.

### Changed
- Streaks are counted by the person's local date, not the server's.
- Windows (breathing, journal, verse, Safe Harbor, settings) keep keyboard focus inside while open.

### Fixed
- Failed saves are no longer lost silently: unsaved changes stay in the browser and a warning is shown.
