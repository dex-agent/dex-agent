# Dex Ecosystem

Dex is organized as a small family of repositories and local skills. The goal
is to keep the runtime, workflow guidance, project instances, and operational
memory understandable without mixing their responsibilities.

## Runtime

### `dex-agent`

Repository: <https://github.com/dex-agent/dex-agent>

`dex-agent` is the Telegram-controlled Codex automation runtime. It owns:

- Telegram bot entrypoint and command handling
- Codex SDK backend and legacy CLI/PTy fallback
- MCP and GitHub skill routing
- local install/update scripts
- config export/import
- Windows start, restart, status, and autostart helpers

The recommended operational install path on Windows is
`%USERPROFILE%\.dex-agent`.

## Companion Workflow

### `auto-fluxo-flow`

Repository: <https://github.com/dex-agent/auto-fluxo-flow>

`auto-fluxo-flow` is a companion workflow skill/plugin for phased Codex agent
work. It provides visual flow governance, specialist routing, checklists,
regress control, and decision points. It is compatible with Dex/Codex
operations, but it is not the runtime.

## Operational Memory

### `dex-memoria`

Repository: <https://github.com/dex-agent/dex-memoria>

`dex-memoria` is the public documental package for the Dex operational memory
lifecycle. It carries the memory contract, templates, examples, and integration
guidance. It does not own bot runtime behavior, Telegram commands, recall,
ledger writes, hooks, or `.agents/` state.

## Project Instances

Project-level Dex installs should live under the target project as
`skills/dex-agent/`. These instances inherit the runtime contracts from the
parent `dex-agent` repository while keeping project-local `.env`, state,
handoff docs, contacts, and install metadata out of Git.

## Operational Skills

The runtime mirrors key skills under `skills/` so child projects can carry the
same operational contract:

- `dex-install`: provision a new child project instance
- `dex-update`: synchronize an existing child project instance
- `dex-memoria`: manage operational memory lifecycle, mirrored from the public
  package when needed for child-project bootstrap
- `dex-acesso`: reason about Telegram access and destination rules
- `dex-contatos`: manage local contact tone profiles without granting access
- `dex-print`: deliver screenshots/images through the Telegram Bot API
- `dex-agent-audio-summary`: deliver voice notes through the Telegram Bot API

## Source Of Truth

- Runtime behavior: `src/`, `scripts/`, and `README.md` in `dex-agent`
- Child install contract: `skills/dex-install/`
- Child update contract: `skills/dex-update/`
- Memory lifecycle package: <https://github.com/dex-agent/dex-memoria>
- Vendored memory lifecycle skill: `skills/dex-memoria/`
- Public project governance: `SECURITY.md`, `CONTRIBUTING.md`, issue
  templates, PR template, Dependabot, and CodeQL workflow

## Release Rhythm

Use SemVer tags for public release anchors:

- `dex-agent`: runtime/package releases, for example `v0.3.1`
- `auto-fluxo-flow`: workflow/plugin releases, for example `v0.1.0`
- `dex-memoria`: memory-contract package releases, for example `v0.1.5`

Release notes should mention install/update commands, changed defaults,
security-sensitive behavior, and rollback guidance when applicable.
