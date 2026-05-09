# Operations Guide

## Process Supervision

This bot uses Telegram long polling, so run exactly one instance per bot token.

There are two supported supervision paths today:

- local Windows operator baseline on this machine: Startup folder autostart
- server-style deployment or always-on host: PM2

`ecosystem.config.ts` is the source of truth for the PM2 path. Start PM2 through `ecosystem.config.cjs`, which is a thin compatibility shim for PM2's config loader.

### Local Windows baseline

Register autostart:

```powershell
Set-Location "$env:USERPROFILE\.dex-agent"
powershell -ExecutionPolicy Bypass -File .\scripts\register-dex-agent-autostart.ps1
Get-Content "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\start-dex-agent.cmd"
```

Remove the autostart entry:

```powershell
Set-Location "$env:USERPROFILE\.dex-agent"
powershell -ExecutionPolicy Bypass -File .\scripts\unregister-dex-agent-autostart.ps1
```

What this path does:

- creates `start-dex-agent.cmd` in the current user's Startup folder
- calls `scripts/boot-dex-agent-autostart.ps1`
- refuses to register from a non-canonical clone unless `-AllowNonCanonicalPath` is passed for controlled testing
- waits 45 seconds after logon
- retries up to 6 times with progressive backoff if the network is not ready yet

Use this path when the bot is tied to one logged-in Windows workstation and you want the same behavior that was already validated locally.

### PM2 path

Start:

```bash
npm install
cp .env.example .env
pm2 start ecosystem.config.cjs
```

Common PM2 commands:

```bash
pm2 status dex-agent
pm2 logs dex-agent
pm2 restart dex-agent
pm2 stop dex-agent
pm2 save
```

## Health Checks

Static health check:

```bash
npm run healthcheck
```

Active `.env` baseline check:

```bash
npm run env:check
```

Strict health check:

```bash
npm run healthcheck:strict
```

Optional Telegram live check:

```bash
npm run healthcheck:strict
npm run healthcheck:live
```

Use your own local `.env` values or CI secrets for live checks. Do not commit or paste live output that includes bot usernames, chat IDs, or Codex thread IDs.

What the health check validates:

- workspace and runner directories exist
- the state file directory is writable
- the configured Codex command can be resolved
- `node-pty` helper permissions are valid
- optional live Telegram API authentication
- the strict mode now fails when the active config still points to legacy or non-canonical Dex Agent paths

## Deployment Notes

- Keep exactly one polling process per bot token.
- On this repository's current Windows baseline, Startup folder autostart is the locally validated path.
- Use PM2 when the target host is server-style, headless, or not tied to one interactive Windows user session.
- If you also use Codex directly in a terminal, run that work in a separate git worktree. The bot only detects conflicts with other bot-managed chats, not external terminal sessions.
- Run the bot under a restricted system user.
- Keep `.env` outside version control.
- Keep `.runtime/`, `.agents/`, and `.codex/` outside the initial public baseline; they are local operational state.
- Let each operator configure live-check credentials locally after startup instead of sharing one checked-in identity.
- Rotate Telegram and GitHub tokens if they are ever exposed.
- If you reinstall dependencies on macOS, rerun `npm run healthcheck`; the bot now auto-repairs `node-pty` helper permissions on startup.
