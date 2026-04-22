# Dex Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-green.svg)](https://nodejs.org/en/download/current)

A Telegram bot that gives you remote access to `@openai/codex` through a Node.js runtime with two Codex backends: the Codex SDK and the legacy CLI/PTy path.  
It is strictly inspired by `RichardAtCT/claude-code-telegram`, but this project is implemented for CodeX SDK/CLI + MCP + Subagent routing.

## Use This Like A Skill

### What It Does

- installs a Telegram-facing Codex runtime
- keeps Codex live sessions scoped to `chat + repo`
- manages bot-side MCP and GitHub subagents
- exposes repo switching, status, and minimal frontend dev-server control from Telegram

### Install

```bash
git clone https://github.com/crsantosxx/dex-agent.git
cd dex-agent
npm install
cp .env.example .env
```

### Configure The Minimum

```bash
BOT_TOKEN=123456789:telegram-token
ALLOWED_USER_IDS=123456789
STATE_FILE=.codex-telegram-claws-state.json
WORKSPACE_ROOT=C:/CodexProjetos
CODEX_WORKDIR=C:/CodexProjetos/dex-agent
CODEX_BACKEND=sdk
```

### Start The Skill

```bash
npm run start
```

### Telegram Quick Use

```text
/status
/repo
/skill
/dev status
/gh create repo my-new-app
```

For agent-oriented setup, see [SKILL.md](./SKILL.md).

## What Is This?

This bot connects Telegram to Codex and routes tasks to the right execution surface:

- **Coding tasks** -> Codex SDK threads or Codex CLI/PTy sessions
- **Explicit tool tasks** -> Subagents (`/mcp`, `GitHub Skill`)
- **Proactive automation** -> Cron scheduler for daily summaries and push notifications

Key design goals:

- Keep Codex interactive sessions smooth and stream-safe on Telegram
- Enforce zero-trust access with whitelist-only users
- Avoid duplicate MCP calls by separating Codex MCP vs Bot MCP responsibilities
- Prefer the SDK backend for new installs, while keeping the CLI backend as a fallback

## Quick Start

### Prerequisites

- Node.js 20+ -- https://nodejs.org/en/download/current
- Codex CLI -- https://github.com/openai/codex
- Telegram Bot Token -- from `@BotFather`

## Screenshot

### Install

```bash
git clone https://github.com/crsantosxx/dex-agent.git
cd dex-agent
npm install
```

### Configure

```bash
cp .env.example .env
```

Minimum required:

```bash
BOT_TOKEN=123456789:telegram-token
ALLOWED_USER_IDS=123456789
STATE_FILE=.codex-telegram-claws-state.json
WORKSPACE_ROOT=C:/CodexProjetos
CODEX_WORKDIR=C:/CodexProjetos/dex-agent
CODEX_BACKEND=sdk
```

Optional safe shell:

```bash
SHELL_ENABLED=true
SHELL_READ_ONLY=true
SHELL_ALLOWED_COMMANDS=["pwd","ls","git status","git diff --stat","npm test","npm run check"]
SHELL_DANGEROUS_COMMANDS=["git add","git commit","git push","rm","mv","cp","npm publish"]
```

### Run

```bash
npm run start
```

Development mode:

```bash
npm run dev
```

Validation:

```bash
npm run check
npm run lint
npm run format:check
npm test
npm run healthcheck
npm run healthcheck:live
```

For live checks, configure your own local `.env` values after startup and keep the output local.

- do not commit or paste live output containing bot usernames, chat IDs, thread IDs, or other environment-specific identifiers
- use your own `BOT_TOKEN`, `ALLOWED_USER_IDS`, and Codex credentials locally
- for GitHub Actions, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_EXPECTED_USERNAME`, and `TELEGRAM_SMOKE_CHAT_ID` in repository secrets instead of hardcoding them

## Development Commands

- `npm run start` - start the bot
- `npm run dev` - watch mode for local development
- `npm run check` - TypeScript type and syntax validation for the repository
- `npm run typecheck` - run the TypeScript compiler in `--noEmit` mode
- `npm run lint` - ESLint for source, tests, scripts, and local JS/CJS config files
- `npm run lint:fix` - apply safe lint fixes
- `npm run format` - format repository files with Prettier
- `npm run format:check` - verify formatting
- `npm test` - run the full test suite
- `npm run healthcheck` - static runtime readiness check
- `npm run healthcheck:strict` - stricter production-oriented health check
- `npm run healthcheck:live` - live Codex + Telegram probe against the configured backend and bot token
- `npm run telegram:smoke` - live Telegram API smoke test when a real bot token is available

## Architecture

```text
Telegram text/audio/image
  -> src/bot/handlers.ts
     -> explicit command handlers (/project, /repo, /queue, /memory, /inbox, ...)
     -> src/runner/ptyManager.ts        (free-text execution -> Codex SDK or Codex CLI)
     -> src/orchestrator/skills/*.ts    (explicit bot-side capabilities)
  -> src/bot/formatter.ts
  -> Telegram sendMessage/editMessageText
```

Finalized responses can also surface a compact follow-up block with explicit quick actions: `run next step`, `request review`, `open inbox`, plus optional audio summary buttons when TTS is enabled.

Core modules:

- `src/index.ts`: bootstrap and lifecycle
- `src/config.ts`: env parsing and validation
- `src/bot/`: auth middleware, formatting, command handlers, deterministic menu/catalog
- `src/orchestrator/`: memory, project understanding, MCP client, explicit skills
- `src/runner/ptyManager.ts`: Codex runner abstraction for SDK threads, CLI/PTy sessions, queueing, and resume state
- `src/cron/scheduler.ts`: proactive scheduled push

Enterprise target architecture: [docs/enterprise-architecture.md](docs/enterprise-architecture.md)
Enterprise Phase 1 roadmap: [docs/phase-1-roadmap.md](docs/phase-1-roadmap.md)
Project memory system v1: [docs/memory-system/README.md](docs/memory-system/README.md)

## Recovery And Governance

If you are using this repository as the dedicated workspace of the bot, the canonical recovery path is:

1. open [INDEX.md](INDEX.md)
2. follow the surfaced pointer into `.agents/PROJECT.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md`, or `.codex/napkin.md`
3. only then open deeper docs, sprint notes, skills, or archives

Current operational rules:

- the local autostart validated on this machine is the Windows Startup folder, not Task Scheduler
- `/project` now reads `INDEX.md`, `.agents/PROJECT.md`, and `.agents/HANDOFF.md -> Current block status` as primary recovery surfaces instead of relying only on `ACTIVE/HANDOFF`
- `.agents/HANDOFF.md -> Current block status` is the canonical place to answer what just closed, how much is complete, what comes next, which specialists are suggested for the live session, and how to fall back if review or replanning is needed
- `skills/README.md` is the authoritative inventory for local skills versus mirrored global skills

Governance principle:

- every action or event should point to a method
- every method should be guided by a contract
- if a recurring flow still has no clear method or no explicit contract, it should not be treated as a stable standard yet
- each working phase should have a named specialist assisting by default:
  - `pensamento` -> `questionador`
  - `planejamento` -> `sprinter`
  - `construir` -> `mapeador-implementacao`
  - `revisar` -> `revisor-codigo` (`Renata Review`)
  - `testar` -> `tio-testador`
  - `veredito` -> `validador-pronto` (`Vera Veredito`)
- when a phase uses its specialist, the close-out should explicitly credit the collaboration of that specialist

## Deterministic Control Plane

The bot now follows a deterministic split:

- free text, transcribed audio, and images go directly to Codex
- structured actions happen only through commands, menu buttons, or inline callbacks
- bot-side MCP and GitHub actions are explicit only

That means:

- `/gh ...` goes to the GitHub skill
- `/mcp ...` goes to the MCP skill
- `/memory ...` and `/inbox ...` go to the project memory control plane
- normal messages stay a Codex conversation turn

This prevents:

- accidental intent capture from heuristic routing
- duplicate MCP work across bot and Codex
- control-plane actions being mixed with free-text execution

## Learning By Reuse

The bot now has a file-based reuse loop on top of project memory:

- finalized Codex responses can become durable memory candidates
- repeated or explicit reusable flows can become `skill_candidate`
- strong and clear cases can auto-promote into a reusable skill
- global skills born from this repo are mirrored back into `skills/`

What changes in practice:

- the main UX stays in chat; the bot can tell you it learned a reusable flow
- `/inbox` remains the review surface for candidates and proposals
- `/memory` remains the technical inspection surface
- `/project` now exposes a `Reuso Rapido` block with recent promoted skills and pending skill candidates
- finalized runtime closeouts, verdict wrappers, meeting wrappers, and phase-labelled narration are now filtered before they can become `skill_candidate`

## Skill Governance

`skills/README.md` is the authoritative inventory for how this repository classifies reusable skills.

Current rule of the repo:

- `dex-agent-audio-summary` is the canonical global skill for summary and explanatory audio via `Dex Agent`; the reusable home lives in the machine-wide vault and this repo keeps a faithful mirror under `skills/`
- `refinador-intencao` is a local product skill for weak or ambiguous captures before deciding between durable memory, local skill, global skill, or live state only
- `promocao-memoria-para-skill` is a faithful mirror of the canonical global skill and must stay aligned with the machine-wide vault contract
- when the local-vs-global decision is obvious and strong, the agent should update the canonical home plus the repo mirror directly and only report what changed; user consultation becomes the exception for materially ambiguous cases

Practical consequence:

- if a repo-specific workflow diverges from the canonical audio-skill contract, give it a new local name instead of changing the mirrored global skill in place
- when a capture is still vague, refine it first through `refinador-intencao` instead of forcing `/remember` or a premature skill promotion

## Commands

General:

- `/start` - bootstrap message
- `/menu` - deterministic dashboard with clickable shortcuts
- `/help` - command summary
- `/status` - show current chat status, active runner mode, workdir, model override, MCP servers, the internal superpowers workflow phase, and the derived operational posture (`working`, `queued`, `awaiting closeout`, `prolonged silence`, etc.)
- `/pwd` - show the current project directory for this chat
- `/repo` - list switchable git projects under `WORKSPACE_ROOT`
- `/repo <name>` - switch the current chat to another project
- `/repo <keyword>` - fuzzy match projects; switch if only one match, otherwise list candidates
- `/repo <typo>` - suggests the closest project name when there is no direct match
- `/repo recent` - show recent projects for the current chat
- `/repo -` - switch back to the previous project
- `/project` - show the current project card with deterministic action buttons
- `/project [default|executive|next|sources|steps|commands|prompts|queue]` - open a specific project card variant; the card now reads `INDEX`, `PROJECT`, and `Current block status`, and exposes direct buttons for `INDEX`, `PROJECT`, `ACTIVE`, and `HANDOFF`
- `/inbox` - show the durable memory inbox for the current project, including `skill_candidate`
- `/inbox [candidates|proposals|promote|discard|why|confirm|cancel|help]` - review and promote durable memory or reusable-skill candidates
- `/memory` - inspect project memory usage, operational memory state, and the surfaced files `INDEX`, `PROJECT`, `ACTIVE`, `HANDOFF`, `napkin`, or `ledger`
- `/memory [show|help|candidates|promote|discard|why|remember <text>]` - technical memory surface backed by the same inbox
- `/new` - clear the saved Codex conversation for the current project and start fresh on the next message
- `/exec <task>` - force a one-off Codex run without saving project context
- `/auto <task>` - force a one-off fully automatic Codex run without saving project context
- `/plan <task>` - ask Codex for a plan only, without direct file modification intent
- `/continue` - replay the last blocked same-workdir Codex request once
- `/model [name|reset]` - show or set the model override for the current chat
- `/language [en|zh|zh-HK]` - show or set the system language for the current chat
- `/verbose [on|off]` - show or toggle system notices for the current chat
- `/skill list` - show skill switches for the current chat
- `/skill status` - alias of `/skill list`
- `/skill on <name>` - enable a skill for the current chat
- `/skill off <name>` - disable a skill for the current chat
- `/dev start` - start the current repo frontend server (`dev`, then `start`)
- `/dev stop` - stop the current repo frontend server
- `/dev status` - show the current repo frontend server status
- `/dev logs` - show the current repo frontend server log tail
- `/dev url` - show the detected local frontend URL
- `/sh <command>` - run a safe allowlisted Linux command in the current project (disabled by default)
- `/sh --confirm <command>` - confirm a dangerous command when writable mode is enabled
- `/restart` - restart the bot process explicitly from Telegram
- `/interrupt` - interrupt the active Codex run
- `/stop` - terminate the active Codex run
- `/cron_now` - trigger daily summary immediately

MCP skill:

- `/mcp list`
- `/mcp status [server]`
- `/mcp reconnect <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`
- `/mcp tools <server>`
- `/mcp call <server> <tool> {"query":"..."}`

GitHub skill:

- `/gh commit "feat: message"` -> explicit GitHub write action
- `/gh push` -> explicit push for the current branch
- `/gh create repo my-new-repo` -> explicit sibling repo creation under `WORKSPACE_ROOT`
- `/gh confirm` -> confirm the pending GitHub write action and execute it
- plain-text write requests such as `create repo ...`, `commit`, or `push` are intercepted and converted into guidance; they no longer execute GitHub writes directly
- `/gh run tests` -> launch test job
- `/gh test status <jobId>` -> read test status/output tail

Telegram adaptation notes:

- Plain text messages behave like a normal Codex conversation turn
- Audio and image inputs also go directly to Codex after bot-side preprocessing
- Structured bot actions are deterministic: command, menu, or button only
- `/exec` runs a one-off Codex task and does not overwrite the saved project conversation slot
- `/auto` runs a one-off Codex task with `approvalPolicy=never` on the SDK backend, or `codex exec --full-auto` on the CLI backend
- `/new` is implemented by the bot and resets the current chat session
- `/new` only clears the current project's saved Codex conversation slot
- `/status` is implemented by the bot and reports local runtime state
- `/status` also surfaces the internal `superpowers` workflow system, the last detected workflow phase, and observability hints from the live operational continuation state so the bot can distinguish active work, queue, waiting, and prolonged silence more honestly
- `/repo` is implemented by the bot and switches the per-chat working directory inside `WORKSPACE_ROOT`
- `/skill` is implemented by the bot and keeps per-chat skill switches in runtime state
- `/skill` only lists toggleable bot skills; `superpowers` is shown as an internal workflow, not a toggleable skill
- reusable-flow learning is file-based and auditable; there is no hidden state, embeddings, or vector DB behind it
- `/dev` is implemented by the bot and manages one frontend server per repo workdir, shared across chats
- `/dev start` prefers `package.json` script `dev` and falls back to `start`
- `/sh` is implemented by the bot, never invokes a shell interpreter, and only accepts configured command prefixes
- `/sh` is read-only by default; dangerous prefixes can be configured and require `--confirm` when writable mode is enabled
- `/plan` translates to a planning-only prompt instead of passing a raw `/plan` slash command to Codex
- If another chat already has an active Codex run in the same workdir, the bot blocks the new request and requires `/continue` for a one-shot override
- The default bot language is `pt-BR`; use `/language` to switch the chat locale
- `/verbose off` keeps Telegram output quiet by hiding fallback, startup, and session-exit notices for the current chat

## Streaming and Reasoning Visualization

Codex output is streamed with throttled `editMessageText` updates.

- Throttle: controlled by `STREAM_THROTTLE_MS` (default `1200`)
- Long output: auto-chunked to Telegram-safe message sizes
- MarkdownV2: escaped to avoid parse failures
- Reasoning tags: `<think>...</think>` extracted and rendered as:
  - spoiler (`||...||`, default)
  - quote block (if `REASONING_RENDER_MODE=quote`)
- On `CODEX_BACKEND=sdk`, Telegram streams structured Codex SDK events and persists thread IDs per project
- On `CODEX_BACKEND=cli`, the bot prefers PTY sessions; if `node-pty` cannot spawn on the current host, it falls back to `codex exec`
- In CLI exec fallback mode, Telegram output is cleaned to hide the Codex banner, raw tool trace, `mcp startup`, and duplicate `tokens used` footer
- On Unix-like hosts, startup auto-repairs `node-pty` helper execute permissions before the first PTY session; on Windows, the preflight validates the native `node-pty` artifact instead

## Project-Scoped Conversation State

Conversation state is now tracked per `chat + project`, not just per chat.

- When you switch with `/repo <name>`, the bot keeps that project's last Codex session id in runtime state
- When you switch back to the same project later, the next plain-text task resumes that project's Codex thread/session
- `/new` clears only the current project's saved conversation slot; other projects in the same Telegram chat are untouched
- `/exec`, `/auto`, and `/plan` stay one-off by design and do not replace the saved project conversation
- On the SDK backend, project restore uses `resumeThread(threadId)`
- On the CLI backend, project restore uses PTY resume or `codex exec resume`

## Workspace Contention Guard

The bot now blocks a second Codex run when another bot-managed chat already has an active Codex task in the same workdir.

- the warning is strong by default because simultaneous writes in the same workdir are easy to corrupt
- `/continue` replays the most recently blocked request once for the current chat
- switching projects clears the pending blocked request
- this guard only sees bot-managed chats in this process; if you also use Codex directly in a terminal, use a separate git worktree to avoid conflicts

## Frontend Debugging Layer

The bot includes a minimal repo-scoped frontend runtime layer:

- `/dev start` starts the current repo's frontend command
- `/dev stop` stops it
- `/dev status` shows whether it is running
- `/dev logs` returns the recent output tail
- `/dev url` returns the first detected local URL from logs

Selection rules:

- prefer `package.json` script `dev`
- if `dev` is missing, fall back to `start`
- keep only one active frontend server per repo workdir
- do not expose arbitrary shell execution through `/dev`

## Backend Selection

Choose the execution backend with `CODEX_BACKEND`:

- `sdk` - preferred for new installs; avoids PTY fragility and uses persistent Codex SDK threads
- `cli` - legacy backend; uses PTY when available and falls back to `codex exec`

SDK-related options:

```bash
CODEX_BACKEND=sdk
CODEX_SDK_CONFIG={}
CODEX_SDK_SKIP_GIT_REPO_CHECK=true
CODEX_SDK_SANDBOX_MODE=danger-full-access
CODEX_SDK_APPROVAL_POLICY=never
CODEX_SDK_REASONING_EFFORT=high
CODEX_SDK_NETWORK_ACCESS_ENABLED=true
CODEX_SDK_WEB_SEARCH_MODE=live
CODEX_SDK_ADDITIONAL_DIRECTORIES=["/abs/path/extra-worktree"]
```

If `CODEX_SDK_SANDBOX_MODE` is unset, the bot now defaults SDK threads to Full Access: `danger-full-access` with `approvalPolicy=never`. Set it explicitly to `workspace-write` or `read-only` only if you want a more restricted mode.

CLI-related options:

```bash
CODEX_BACKEND=cli
CODEX_COMMAND=codex
CODEX_ARGS=
```

## Event-Driven Automation

`node-cron` is built in for proactive behavior:

- Daily summary schedule: `CRON_DAILY_SUMMARY` (default `0 9 * * *`)
- Target users: `PROACTIVE_USER_IDS`
- Summary includes commit count, changed files, insertions/deletions, and recent commits

Use `/cron_now` for manual trigger during debugging.

## Configuration

Required:

```bash
BOT_TOKEN=...
ALLOWED_USER_IDS=123456789,987654321
STATE_FILE=.codex-telegram-claws-state.json
WORKSPACE_ROOT=C:/CodexProjetos
CODEX_WORKDIR=C:/CodexProjetos/dex-agent
```

Common options:

```bash
TELEGRAM_API_BASE=https://api.telegram.org
TELEGRAM_PROXY_URL=
CODEX_COMMAND=codex
CODEX_ARGS=
CODEX_BACKEND=sdk
CODEX_SDK_CONFIG={}
CODEX_SDK_SKIP_GIT_REPO_CHECK=true
CODEX_SDK_SANDBOX_MODE=
CODEX_SDK_APPROVAL_POLICY=
CODEX_SDK_REASONING_EFFORT=
CODEX_SDK_NETWORK_ACCESS_ENABLED=
CODEX_SDK_WEB_SEARCH_MODE=
CODEX_SDK_ADDITIONAL_DIRECTORIES=[]
WORKSPACE_ROOT=C:/CodexProjetos
STATE_FILE=.codex-telegram-claws-state.json
SHELL_ENABLED=false
SHELL_READ_ONLY=true
SHELL_ALLOWED_COMMANDS=["pwd","ls","git status","git diff --stat","npm test","npm run check"]
SHELL_DANGEROUS_COMMANDS=["git add","git commit","git push","rm","mv","cp","npm publish"]
SHELL_TIMEOUT_MS=20000
SHELL_MAX_OUTPUT_CHARS=12000
STREAM_THROTTLE_MS=1200
STREAM_BUFFER_CHARS=120000
REASONING_RENDER_MODE=spoiler

CRON_DAILY_SUMMARY=0 9 * * *
CRON_TIMEZONE=America/Sao_Paulo
PROACTIVE_USER_IDS=123456789
```

MCP:

```bash
MCP_SERVERS=[]
```

GitHub:

```bash
GITHUB_TOKEN=ghp_xxx
GITHUB_DEFAULT_WORKDIR=C:/CodexProjetos/dex-agent
GITHUB_DEFAULT_BRANCH=main
E2E_TEST_COMMAND=npx playwright test --reporter=line
```

Recommended local Windows baseline for this repository:

```bash
STATE_FILE=.codex-telegram-claws-state.json
WORKSPACE_ROOT=C:/CodexProjetos
CODEX_WORKDIR=C:/CodexProjetos/dex-agent
GITHUB_DEFAULT_WORKDIR=C:/CodexProjetos/dex-agent
```

Use `npm run env:check` to verify the active `.env` against this baseline before startup.

## CI And Release Automation

GitHub Actions now includes:

- `CI` workflow on push and pull request
- `Telegram Smoke` manual workflow for live bot-token validation when repository secrets are configured
- `Release` workflow on `v*` tags, which reruns validation and publishes a GitHub Release

Repository secrets for live smoke checks:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_EXPECTED_USERNAME` (optional)
- `TELEGRAM_SMOKE_CHAT_ID` (optional)

Keep live verification output out of git history and release notes. Bot usernames, thread IDs, and chat IDs are environment-specific operator data and should be configured by each user locally or through GitHub secrets.

Recommended local release gate:

```bash
BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run release:check
npm run healthcheck:live
npm run telegram:smoke
```

`v1.0.0` should only be tagged after the full release gate, Telegram smoke checks, and repository metadata sync are complete. The detailed checklist and topic sync command live in [release.md](./docs/release.md).

Release references:

- [operations.md](./docs/operations.md)
- [release.md](./docs/release.md)
- [ecosystem.config.cjs](./ecosystem.config.cjs) - PM2 compatibility shim

## Security Baseline

- Whitelist-only access (`ALLOWED_USER_IDS`) is mandatory
- Do not commit `.env`, tokens, or session artifacts
- Run bot under a restricted OS user in production
- Keep `CODEX_WORKDIR` scoped to a safe workspace root
- Keep `WORKSPACE_ROOT` limited to a parent directory that only contains projects you want the bot to access
- Keep `/sh` disabled unless you need it; when enabled, only expose read-only or narrowly scoped command prefixes
- `/sh` uses `spawn(..., { shell: false })`, rejects pipes/redirection/subshell syntax, and runs inside the current project directory
- Keep `SHELL_READ_ONLY=true` unless you have a strong reason to allow write commands
- If you allow write commands, mark high-risk prefixes in `SHELL_DANGEROUS_COMMANDS` and require `/sh --confirm ...`
- Prefer least-privilege GitHub PAT

## Operations

Current local Windows baseline on this machine:

- autostart via the current user's Windows Startup folder
- hidden restart via `restart-dex-agent-hidden.vbs -> restart-dex-agent-hidden.ps1`
- one polling process per bot token

PM2 remains a supported supervisor for server-style or always-on hosts, but it is not the only valid deployment path.

`ecosystem.config.ts` is the canonical PM2 config file. Start PM2 with `ecosystem.config.cjs`, which only bridges PM2 into the TypeScript source.

PM2 flow when that is your target environment:

```bash
pm2 start ecosystem.config.cjs
pm2 status dex-agent
pm2 logs dex-agent
pm2 restart dex-agent
```

Run exactly one polling process per bot token.

Windows autostart for the current user:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-dex-agent-autostart.ps1
Get-Content "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\start-dex-agent.cmd"
```

Remove the autostart entry:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\unregister-dex-agent-autostart.ps1
```

The registered autostart uses the current user's Windows Startup folder and creates `start-dex-agent.cmd`, which calls `scripts/boot-dex-agent-autostart.ps1`. That boot script waits 45 seconds after logon and then retries up to 6 times with progressive backoff if the network is not ready yet.

## Publication Hygiene

Keep these local-only artifacts out of the initial publish baseline:

- `.env`
- `.codex-telegram-claws-state.json`
- `.runtime/`
- `.agents/`
- `.codex/`

The local continuity layer and runtime logs are useful for operating this machine, but they are not part of the public product contract.

## Should You Enable `/sh`?

Usually not for general users. Codex itself can run commands as part of a coding task, so `/sh` is not required for normal code-edit workflows.

It is useful when you need deterministic operator actions from Telegram, such as:

- `pwd`
- `git status`
- `git diff --stat`
- `npm test`

Treat it as an admin-only ops channel, not a general-purpose remote shell.

## MCP and Skill Control Plane

Telegram can manage runtime usage of Bot-side MCP and skills, but not install arbitrary new servers from chat.

- MCP servers are process-level runtime resources: list, inspect, reconnect, enable, disable
- Skills are chat-level routing switches: each chat can enable or disable `github` and `mcp` independently
- Codex's own MCP remains separate and is not managed through these bot commands
- Runtime state is persisted to `STATE_FILE`, so `/mcp enable|disable`, `/skill on|off`, `/language`, `/verbose`, and per-project Codex conversation slots survive bot restarts

## Troubleshooting

- **Bot not responding**: verify `BOT_TOKEN` and `ALLOWED_USER_IDS`
- **Telegram API blocked**: set `TELEGRAM_PROXY_URL` (HTTP proxy like `http://127.0.0.1:7890`) or run a local Bot API server and set `TELEGRAM_API_BASE`
- **Codex not producing output**: verify `CODEX_BACKEND`, `CODEX_COMMAND`, and `CODEX_WORKDIR`
- **SDK backend cannot resume**: verify the host still has access to `~/.codex/sessions` and that the saved thread id belongs to the same working directory
- **Markdown parse errors**: reduce output size/context; check special characters in tool output
- **MCP failures**: run `/mcp tools <server>` first to validate server availability
- **GitHub API failures**: verify `GITHUB_TOKEN` scope (`repo`) and account permissions
- **Duplicate MCP suspicion**: ensure coding tasks are routed directly to Codex, and bot MCP is used only for `/mcp`
- **`posix_spawnp failed` on macOS/Linux**: this usually means the `node-pty` helper lost execute permissions; startup now auto-repairs it, and `npm run healthcheck` reports the result
- **CLI/PTy warnings on Windows**: verify `npm run healthcheck`; the Windows preflight checks the native `node-pty` artifact instead of the Unix `spawn-helper`

## Reference

- Inspired by: https://github.com/RichardAtCT/claude-code-telegram
- Codex SDK reference: https://github.com/coleam00/codex-telegram-coding-assistant
- This implementation: Codex-first Node.js stack (`@openai/codex-sdk`, `telegraf`, `node-pty`, `node-cron`, MCP SDK)
