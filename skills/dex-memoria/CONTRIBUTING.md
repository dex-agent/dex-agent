# Contributing

Thanks for helping improve `dex-memoria`.

This repository is intentionally small and public. It carries the documentation,
templates, examples, and skill contract for Dex Agent operational memory. It is
not the Dex Agent runtime.

## Before You Change Files

- Check `git status --short` and preserve work you did not make.
- Do not edit secrets, local state, `.env`, runtime ledgers, private `.agents/`
  data, logs, screenshots, or session artifacts.
- Keep examples sanitized and free of real personal data.
- Keep behavior claims aligned with version `0.1.5`: no hooks, no automatic
  memory writes, and no promised V2 scripts unless they actually exist.

## Development

Run the available local checks:

```bash
npm run check
npm run doctor
npm run pack:check
```

`npm run check` validates the public repository structure and package metadata.
`npm run doctor` validates the installed package contract from the CLI entry
point. `npm run pack:check` verifies the package contents that would be packed.

## Pull Requests

- Keep changes focused.
- Update `CHANGELOG.md` when the public contract or package surface changes.
- Update `README.md` or `docs/` when usage changes.
- Explain whether the change affects Dex Agent runtime integration or only this
  documentation package.
