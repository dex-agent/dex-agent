# Release Process

## Release Type

- Use `v0.x` tags for beta releases.
- Do not cut `v1.0.0` until CI, the chosen supervision path, and Telegram smoke checks are part of the normal release path.

## v1.0.0 Release Gate

Treat `v1.0.0` as a stability contract, not just a bigger tag.

Required before tagging `v1.0.0`:

- `CODEX_BACKEND=sdk` is the documented default and the normal production path
- natural-language repo creation works in Telegram, including sibling repo creation under `WORKSPACE_ROOT`
- `npm run release:check` passes locally and in GitHub Actions
- `npm run healthcheck:live` passes with operator-owned credentials
- `npm run telegram:smoke` passes against the production bot token or a release-candidate bot token
- the chosen supervision path has been verified on the release target host
  - Startup folder on the current local Windows workstation
  - or PM2 / another formal supervisor on a server-style host
- `README.md`, `docs/operations.md`, and this document match the current commands and behavior
- repository metadata is current: description, topics, release notes, and secrets documentation

Recommended manual release-candidate checks on Telegram:

- send a normal coding request and verify streaming still works
- create a sibling repo with `/gh create repo my-release-smoke-repo`
- create a sibling repo with `/gh create repo my-release-smoke-repo`, then confirm it with `/gh confirm`
- verify `/repo`, `/continue`, `/gh push`, `/gh confirm`, and `/mcp list` still behave correctly in the same chat
- verify same-workdir contention still blocks a second chat until `/continue`

## Pre-Release Checklist

Run locally:

```bash
npm install
BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run release:check
```

Recommended production checks:

```bash
npm run healthcheck:strict
npm run healthcheck:live
```

Use operator-owned local credentials or GitHub secrets for live checks. Do not put real bot usernames, chat IDs, Telegram identities, or Codex thread IDs into tracked docs, release notes, or commits.

Publication hygiene for the initial public baseline:

- do not publish `.env`
- do not publish `.codex-telegram-claws-state.json`
- do not publish `.runtime/`
- do not publish `.agents/`
- do not publish `.codex/`

Manual checks:

- verify `/status`, `/repo`, `/continue`, `/language`, `/verbose`, `/mcp list`, and `/gh` on a real Telegram chat
- verify `powershell -ExecutionPolicy Bypass -File .\scripts\status-dex-agent.ps1` reports the bot running and hidden on the local Windows baseline
- verify PTY mode is active on the target host
- verify cron and proactive push configuration
- verify only one bot instance is polling
- verify no second bot-managed chat can start a same-workdir Codex run without the explicit `/continue` override
- record only pass/fail status in release notes; keep raw live output private to the operator who ran the checks

## Repository Metadata

Keep GitHub repository topics aligned with the current product surface. The target topic set for this repo is:

- `telegram-bot`
- `codex`
- `openai`
- `remote-coding`
- `ai-agent`
- `github-integration`
- `mcp`
- `subagents`
- `developer-tools`
- `claude-code`
- `skill`

Apply them with GitHub CLI:

```bash
gh repo edit dex-agent/dex-agent \
  --add-topic telegram-bot \
  --add-topic codex \
  --add-topic openai \
  --add-topic remote-coding \
  --add-topic ai-agent \
  --add-topic github-integration \
  --add-topic mcp \
  --add-topic subagents \
  --add-topic developer-tools \
  --add-topic claude-code \
  --add-topic skill
```

## Tag And Publish

```bash
git checkout main
git pull --ff-only
BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run release:check
git tag v0.2.3
git push origin main --tags
```

Pushing a `v*` tag triggers the GitHub release workflow.

## Rollback

```bash
git checkout <previous-stable-tag>
npm install
```

After rollback, rerun:

```bash
npm run healthcheck
```

Then restart using the supervision path for that host:

- local Windows workstation: Startup folder or `scripts/start-dex-agent.ps1`
- server-style host: PM2 or the chosen formal supervisor
