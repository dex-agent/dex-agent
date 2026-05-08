# Repository Guidelines

## Repo Structure

- `src/index.ts`: application entrypoint and subsystem wiring.
- `src/bot/`: Telegram handlers, formatting, command parsing, i18n, middleware.
- `src/orchestrator/`: routing, MCP client, skill registry, GitHub/MCP skills.
- `src/runner/`: Codex SDK/CLI runner management, PTY fallback handling, and restricted shell execution.
- `src/cron/`: scheduled proactive jobs.
- `tests/`: Node built-in test suite, one `*.test.js` file per module area.

## Start And Dev Commands

- `npm install`: install dependencies.
- `npm run start`: start the Telegram bot with the current `.env`.
- `npm run dev`: run the bot in watch mode for local development.
- Use `CODEX_BACKEND=sdk` for the preferred SDK-backed runner; keep `CODEX_BACKEND=cli` only when you specifically need the legacy PTY/CLI path.

## Cross-Project Audio Requests

- If any workspace asks for audio sent by the bot, route to `dex-agent-audio-summary` (`dex-audio`) through the global wrapper before considering generic Telegram or voice-prep skills.
- Do not satisfy bot-audio requests with a local `.wav`, `.mp3`, text-only handoff, `audio-direcao-voz`, or `tele-codex`; the expected proof is a Telegram `voice note` with `message_id`.
- For user-initiated Telegram requests, audio must be sent to the requesting chat. `DEX_REQUEST_CHAT_ID` / `DEX_CURRENT_CHAT_ID` or an explicit `-ChatId` wins over `PROACTIVE_USER_IDS` and `ALLOWED_USER_IDS`.
- `tele-codex` may prepare short Telegram text/status messages, but audio ownership stays with `dex-agent-audio-summary`. If routing is unclear, return to flow governance/Fernanda instead of guessing.

## Cross-Project Visual Print Requests

- If any workspace asks for a print/screenshot/image delivered through Telegram, Dex, bot, or the configured Dex parent bot, route to `dex-print`.
- Do not satisfy bot-print requests with only a local screenshot, Codex attachment, or Telegram Web manual send; the expected proof is a Bot API `photo` or `document` response with `message_id`.
- For user-initiated Telegram requests, prints must be sent to the requesting chat. `ALLOWED_USER_IDS` is an access list, not the response target when the current chat is known.
- Keep audio and print separate: audio uses `dex-agent-audio-summary` / `dex-audio`; visual image delivery uses `dex-print`.

## Multi-User Telegram Access

- Use `skills/dex-acesso/SKILL.md` when work touches Telegram access, multiple allowed IDs, `ALLOWED_USER_IDS`, `PROACTIVE_USER_IDS`, or media delivery to the wrong chat.
- `ALLOWED_USER_IDS` means who may talk to the bot. `PROACTIVE_USER_IDS` means who receives system/admin-initiated proactive messages.
- In a request started from a Telegram conversation, the current chat wins for media delivery. Only fall back to configured IDs when there is no requesting chat.
- Every new allowed ID needs a real `/status`, `dex-print`, and `dex-audio` validation with `message_id` before considering the multi-user setup proven.

## Contact Tone Profiles

- Use `skills/dex-contatos/SKILL.md` when work touches contact tone, how to address a person, detail level, or media preference by `chat_id`.
- `dex-contatos` never grants access, never changes media destination, and never writes operational memory.
- Real contact profiles live in `.agents/CONTACTS.local.json`, which must stay out of Git. Version only templates and examples without real personal data.

## Operational Memory Lifecycle

- Use `skills/dex-memoria/SKILL.md` when work touches operational memory, resolved findings, `MEMORY.ndjson`, handoff state, `dex-pai`, `dex-rede`, or child-to-child memory routing.
- If any child project or user asks to "memorizar", "lembrar", "guardar como memoria", or equivalent, route through `dex-memoria` and its full lifecycle contract before writing or treating it as recall guidance.
- Treat `docs/memory-system/README.md` as the runtime/architecture reference. Treat `skills/dex-memoria` as the practical lifecycle protocol for creating, remembering, resolving, archiving, superseding, and stopping operational memories from being remembered.
- `dex-memoria` replaces loose operational use of the memory-system docs; it does not remove or supersede the runtime documentation.
- `dex-memoria` v1 is a manual/documented lifecycle contract, not an automatic hook or script runner.
- Do not assume memory lifecycle scripts exist. Future scripts such as `add`, `resolve`, `archive`, `status`, or `audit` belong to a later V2 after repeated real use with low ambiguity.
- For live next-step recovery, `HANDOFF.md` wins over `MEMORY.ndjson`; `ACTIVE.md` owns the live objective and open loops; resolved or archived memory must not reopen work by itself.
- Child project bootstraps must preserve this same rule: after install/update/reboot, any memory request must start from `skills/dex-agent/skills/dex-memoria/SKILL.md`, not from loose notes or ad hoc ledger writes.

## Windows Process Visibility

- Dex Agent child installs and restarts must run background services and helper processes hidden on Windows.
- Use `Start-Process -WindowStyle Hidden` in PowerShell launchers and `windowsHide: true` for Node `spawn(...)` calls that start helpers, dev servers, checks, TTS, or Codex exec jobs.
- Do not leave visible `cmd.exe`/PowerShell windows as a normal side effect of Telegram requests. If a user reports visible windows, inspect process trees and fix the launcher/runner contract instead of treating it as cosmetic.

## Project Instance Install And Update

- Use `skills/dex-install/SKILL.md` when installing Dex Agent into a new project child with a dedicated Telegram bot.
- Use `skills/dex-update/SKILL.md` when synchronizing an existing child installation that already has `skills/dex-agent/instance.json`.
- `dex-install` and `dex-update` are operational contracts for provisioning and synchronization; they do not replace `dex-memoria`, `dex-pai`, `dex-rede`, `dex-print`, `dex-audio`, or `dex-acesso`.
- Installation and update flows must preserve secrets: never write Telegram tokens to docs, commits, prompts, reports, screenshots, or final responses.
- New project installs should create/update child bootstrap files (`AGENTS.md`, `INDEX.md`, `.agents/DEX_PAI.md`, `.agents/DEX_REDE.md`) and register project aliases for `dex-rede`.
- Do not register autostart for a new child by default; prove local status and Telegram behavior first.
- Install/update bootstraps for child projects must mention hidden Windows process behavior and the `dex-memoria` memory lifecycle rule so the child survives reboot with the same operational contract.

## Visible Final-Action Contract

- Do not auto-offer the final dynamic action panel by default.
- `FINAL_ACTIONS_AUTO_OFFER=false` is the default and must be written by install/update flows for child projects.
- If a project wants the final action buttons (`Como seguir daqui?`, short continue, planning, review, autopilot, or related buttons), enable them explicitly with `FINAL_ACTIONS_AUTO_OFFER=true` in that instance `.env`.
- Keep the contract visible: hidden UX constraints, hidden default next-step nudges, or automatic scope-limiting panels should be opt-in configuration, not implicit behavior.

## Test Commands

- `npm test`: run the full unit test suite with the Node test runner plus `tsx`.
- `npm run check`: run the repository typecheck gate.
- `npm run typecheck`: run `tsc --noEmit` directly.
- `npm run healthcheck`: run the local runtime health check.
- `npm run healthcheck:live`: run the live Codex + Telegram health probe when local credentials are configured.

## Lint And Format

- `npm run lint`: run ESLint over source, tests, scripts, and local JS/CJS config files.
- `npm run lint:fix`: apply safe ESLint fixes.
- `npm run format`: run Prettier across the repository.
- `npm run format:check`: verify formatting without writing changes.
- Do not submit formatting-only churn or rewrap unrelated files.

## Files And Paths You Must Not Change

- Do not edit `.git/` or `node_modules/`.
- Do not commit or rewrite `.env`, secrets, Telegram tokens, or local session artifacts.
- Do not manually edit `.codex-telegram-claws-state.json`; it is runtime state.
- Avoid changing files outside this repository root, even when `/repo` or shell features reference other workspaces.

## Contribution Rules

- Use ES Modules and keep new files under the existing feature-oriented layout.
- Keep the runtime bot UX aligned with the default `pt-BR` locale. Public docs can stay in English, and localized bot strings must go through `src/bot/i18n.js`.
- Prefer focused changes. Do not mix feature work with unrelated refactors.
- Add or update tests for behavior changes in `tests/`.

## Required Verification Before Commit

- Run `npm run check`.
- Run `npm run lint`.
- Run `npm run format:check`.
- Run `npm test`.
- Run `npm run healthcheck`.
- Run `npm run healthcheck:live` before production-facing releases when real credentials are available.
- Review `git diff --stat` and `git status --short` for accidental edits.
- If bot commands or behavior changed, update `README.md` and include a Telegram usage example in the PR or commit notes.
