# Security Policy

## Supported Version

`dex-memoria` is a public documentation and skill contract package. The current
supported public line is `0.1.x`, with version `0.1.5` as the active release.

## Scope

This repository must not contain secrets, runtime state, Telegram tokens,
private `.agents/` data, inboxes, ledgers, screenshots, logs, local sessions, or
Dex Agent production configuration.

The package documents the memory lifecycle contract used around Dex Agent. It
does not provide the Dex Agent runtime, does not install hooks, and does not
write operational memory by itself.

## Reporting A Vulnerability

If you find a vulnerability or accidental exposure:

1. Do not open a public issue containing secrets or exploitable details.
2. Contact the maintainers through the private security reporting channel
   configured on GitHub, or use a private maintainer contact if GitHub private
   reporting is unavailable.
3. Include the affected file, commit, command, or package version when possible.

Maintainers should confirm receipt, remove exposed material from active
surfaces, rotate any affected credential outside this repository, and publish a
sanitized fix or advisory when appropriate.

## Safe Contribution Rules

- Never commit `.env`, tokens, real chat IDs, local ledgers, inboxes, screenshots,
  logs, or generated runtime state.
- Keep examples sanitized and fictional.
- Keep runtime changes in `dex-agent`; this package only carries public
  documentation, templates, examples, and lightweight validation.
