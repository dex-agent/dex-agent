# CodeQL Security Alerts Remediation Design

**Date:** 2026-05-11

**Goal:** Remediate the 5 open GitHub CodeQL code scanning alerts on `dex-agent/dex-agent` without changing runtime behavior beyond the minimum security hardening needed to close or justify each alert.

## Context

GitHub Security reports 5 open CodeQL alerts on `main`:

- High: reflected cross-site scripting in `src/lib/adminWebServer.ts`
- High: clear-text logging of sensitive information in `skills/dex-print/scripts/send-dex-print.mjs`
- High: clear-text logging of sensitive information in `scripts/telegramSmoke.ts`
- Medium: identity replacement in `src/lib/audioTts.ts` for `Telegram`
- Medium: identity replacement in `src/lib/audioTts.ts` for `Codex`

The security overview also shows repository settings that are separate from code remediation:

- `Private vulnerability reporting`: disabled
- `Dependabot alerts`: disabled

Those settings should be handled as repository administration after the code alerts are remediated or explicitly tracked as a separate operational step.

## Scope

This design covers:

- making admin dashboard HTML rendering explicit enough to satisfy XSS safety expectations
- preventing dry-run or smoke-check output from exposing sensitive operational identifiers by default
- removing no-op text normalizations that trigger CodeQL identity replacement alerts
- adding regression tests for the behavior that matters
- rerunning the repository verification gates
- confirming CodeQL alert status after push/scan

## Non-Goals

- Changing Telegram Bot API behavior
- Changing real media delivery behavior for `dex-print`
- Hiding all user-facing diagnostic output
- Reworking the admin dashboard UI
- Replacing the current CodeQL workflow
- Enabling GitHub repository settings from code
- Treating Dependabot version-update PRs as part of this remediation

## Constraints

- Do not expose Telegram tokens, chat IDs, request chat IDs, local profile paths, or private env values in logs, docs, commits, PR descriptions, screenshots, or final responses.
- Keep `dex-print` useful for dry-run validation while masking sensitive values by default.
- Preserve the existing `pt-BR` runtime UX and existing command shapes.
- Keep changes focused to the alerted files and their tests.
- Do not dismiss CodeQL alerts unless the code has been made safe or the alert is proven to be an unavoidable false positive with written justification.

## Recommended Approach

Use a risk-first remediation order:

1. Patch sensitive logging in `dex-print` and `telegramSmoke`.
2. Remove the two no-op replacements in `audioTts`.
3. Harden and test admin dashboard HTML rendering against injected `workdir` and snapshot content.
4. Run focused tests first, then the full repository gates.
5. Push the fix and wait for CodeQL to refresh before closing the loop.

## File Groups

### Sensitive Logging

Modify:

- `skills/dex-print/scripts/send-dex-print.mjs`
- `scripts/telegramSmoke.ts`

Add or update tests:

- `tests/mediaHelperRouting.test.ts`
- `tests/telegramSmoke.test.ts`

Expected behavior:

- dry-run JSON should not print raw `chat_id` by default
- dry-run text should not print raw `chat_id`
- smoke-check username mismatch should not print raw env-derived expected username by default
- if full diagnostic output is needed later, it should require an explicit opt-in flag or local-only debug mode

### Admin Dashboard XSS

Modify:

- `src/lib/adminWebServer.ts`

Update tests:

- `tests/adminWebServer.test.ts`

Expected behavior:

- user-controlled URL values, especially `workdir`, never render as executable HTML or JavaScript
- dashboard snapshot strings remain escaped in text nodes and attributes
- refresh URL remains encoded and escaped
- error messages remain escaped

### Audio TTS Normalization

Modify:

- `src/lib/audioTts.ts`

Update tests only if current expectations depend on the removed no-op replacements:

- `tests/audioTts.test.ts`

Expected behavior:

- removing `.replace(/\bTelegram\b/g, "Telegram")` and `.replace(/\bCodex\b/g, "Codex")` must not change spoken output
- existing token rewrites for `API`, `SDK`, `TTS`, `pt-BR`, `OpenAI`, `OpenRouter`, and `DexAgent` remain intact

### Repository Security Settings

No code file change required.

Operational follow-up:

- consider enabling Dependabot alerts
- consider enabling private vulnerability reporting
- record the decision separately if the repo owner chooses not to enable either setting

## Testing Strategy

### Focused verification

Run the smallest tests after each patch group:

```bash
node --import tsx --test tests/mediaHelperRouting.test.ts
node --import tsx --test tests/telegramSmoke.test.ts
node --import tsx --test tests/adminWebServer.test.ts
node --import tsx --test tests/audioTts.test.ts
```

### Final repository gate

Run the repository-required gates:

```bash
npm run check
npm run lint
npm run format:check
npm test
npm run healthcheck
```

Run `npm run healthcheck:live` only if real credentials are configured and this is being prepared for a production-facing release.

### GitHub verification

After pushing the remediation:

- open `https://github.com/dex-agent/dex-agent/security/code-scanning`
- confirm the 5 alerts are closed or reduced
- if CodeQL still reports an alert, inspect the new path before dismissing it

## Risks

- Masking `chat_id` too aggressively may reduce dry-run usefulness. The dry-run output should keep source and presence metadata while redacting the raw identifier.
- CodeQL may still flag the admin dashboard if it cannot infer the local escape helper. If that happens, use a clearer safe-rendering boundary rather than dismissing immediately.
- `telegramSmoke` is a diagnostic script, so overly terse errors can make setup harder. Keep the mismatch actionable without printing env-derived sensitive values.
- GitHub repository settings require authenticated UI/admin action and should not be represented as fixed by code changes.

## Success Criteria

- The 5 current CodeQL alerts have corresponding code changes or documented false-positive handling.
- Sensitive operational identifiers are not logged in clear text by default.
- No-op replacements are removed.
- Admin dashboard rendering has regression coverage for escaped user-controlled values.
- Focused tests and repository gates pass.
- GitHub CodeQL shows no remaining open alerts for the remediated paths, or any residual alert has a precise follow-up owner and reason.

## Follow-Up

After the code remediation lands:

1. Decide whether to enable Dependabot alerts.
2. Decide whether to enable private vulnerability reporting.
3. If either setting remains disabled, document why in the PR or security maintenance notes.
