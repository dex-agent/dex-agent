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
- `tele-codex` may prepare short Telegram text/status messages, but audio ownership stays with `dex-agent-audio-summary`. If routing is unclear, return to flow governance/Fernanda instead of guessing.

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
