# Contributing

Thanks for helping improve Dex Agent. This project is a local automation
runtime, so small changes should preserve operator safety and predictable
Windows behavior.

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
npm run env:check
```

Use placeholder values in `.env` for static validation. Do not commit real
tokens, chat IDs, local contacts, runtime state, or exported configuration ZIPs.

## Development Checks

Run the same gate used by CI before opening a pull request:

```powershell
npm run check
npm run lint
npm run format:check
npm test
npm run healthcheck
```

For production-facing runtime changes, also run live checks only with local
credentials that are safe for your environment:

```powershell
npm run healthcheck:live
npm run telegram:smoke
```

## Pull Request Expectations

- Keep changes focused.
- Update tests for behavior changes.
- Update `README.md` or docs when bot commands, install behavior, config, or
  operational contracts change.
- Preserve the default `pt-BR` bot UX unless the change is explicitly about
  localization.
- Do not reformat unrelated files.
- Do not commit `.env`, `.runtime/`, local contacts, generated archives,
  screenshots with private data, or `node_modules/`.

## Release Notes

Use concise, operator-facing notes. Mention migration steps, changed defaults,
new required variables, and rollback guidance when relevant.
