# Security Policy

Dex Agent is a Telegram-controlled Codex automation runtime. Treat bot tokens,
API keys, Telegram user IDs, local contact profiles, exported configuration
archives, runtime state, and GitHub tokens as sensitive operator data.

## Supported Versions

Security fixes target the current `main` branch and the latest published npm
version. Older versions may receive fixes when a low-risk backport is practical.

## Reporting A Vulnerability

Please do not open a public issue for suspected credential exposure, command
execution bypasses, authentication bypasses, or unsafe automation behavior.

Use GitHub private vulnerability reporting when available on this repository.
If private reporting is not available, contact the maintainers privately and
include:

- affected version or commit
- operating system and Node.js version
- a minimal reproduction
- expected impact
- whether any secrets or personal data were exposed

Do not include real bot tokens, API keys, personal chat IDs, exported config
archives, or private logs in the initial report.

## Security Baseline

- `.env`, `.runtime/`, `node_modules/`, local contacts, and local network
  registries must stay out of Git and npm packages.
- `CODEX_BACKEND=sdk` is the preferred runtime backend for new installs.
- Telegram access is controlled by `ALLOWED_USER_IDS`; proactive/admin messages
  use `PROACTIVE_USER_IDS`.
- Shell execution is disabled by default and must remain allowlisted when
  enabled.
- Windows background launchers should run hidden and should not leave visible
  helper terminals as a normal side effect.
