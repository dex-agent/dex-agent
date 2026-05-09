---
name: Dex Agent
description: Install and operate a Telegram bot that exposes Codex, MCP, GitHub subagents, repo switching, and minimal frontend dev-server control.
---

# Dex Agent

## What This Skill Does

- runs Codex through Telegram
- keeps coding sessions scoped to `chat + repo`
- exposes `/repo`, `/status`, `/skill`, `/gh`, `/mcp`, and `/dev`
- supports frontend repo debugging with `/dev start|stop|status|logs|url`

## Install

```powershell
$DexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
git clone https://github.com/dex-agent/dex-agent.git $DexAgentHome
Set-Location $DexAgentHome
npm install
Copy-Item .env.example .env
```

## Required Env

Set at least:

```env
BOT_TOKEN=123456789:telegram-token
ALLOWED_USER_IDS=123456789
STATE_FILE=.codex-telegram-claws-state.json
WORKSPACE_ROOT=%USERPROFILE%/.dex-agent
CODEX_WORKDIR=%USERPROFILE%/.dex-agent
CODEX_BACKEND=sdk
```

## Start

```bash
npm run start
```

## Verify

```bash
npm run check
npm run lint
npm run format:check
npm test
npm run healthcheck
```

## Install In A Child Project

Use `skills/dex-install/README.md` for the script-first installation flow and
`skills/dex-install/templates/install-prompt.md` for the ready prompt.

## Telegram Quick Use

```text
/status
/repo
/skill
/repo my-project
/dev status
/gh create repo my-new-repo
/gh confirm
```

## Frontend Debugging

Use these commands inside the current repo selected by `/repo`:

- `/dev start`
- `/dev stop`
- `/dev status`
- `/dev logs`
- `/dev url`
- `/gh create repo ...`, `/gh push`, and `/gh commit "..."` are explicit write paths
- `/gh confirm` executes the pending GitHub write action
- plain-text `create repo`, `commit`, and `push` requests are blocked and turned into guidance

Rules:

- `dev` script is preferred
- `start` script is used as fallback
- frontend runtime is shared per repo, not per chat
- `/dev` is not a general-purpose shell

## Notes

- `superpowers` is an internal workflow and shows up in `/status`, not as a toggleable `/skill`
- `/sh` remains a restricted operator channel and is separate from `/dev`
