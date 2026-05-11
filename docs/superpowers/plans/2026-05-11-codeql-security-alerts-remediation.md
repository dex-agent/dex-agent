# CodeQL Security Alerts Remediation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans or the local flow owner before implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close or materially remediate the 5 open CodeQL code scanning alerts on `dex-agent/dex-agent`.

**Architecture:** Treat the alerts as three patch groups: sensitive logging, admin dashboard HTML safety, and no-op speech normalization cleanup. Keep each patch small, add focused tests at the nearest behavior boundary, then run the full repository gate and verify GitHub CodeQL after push.

**Tech Stack:** Node.js 20+, TypeScript, JavaScript skill scripts, CodeQL, node:test, ESLint, Prettier

---

## File Map

### Sensitive Logging

- Modify: `skills/dex-print/scripts/send-dex-print.mjs`
- Modify: `scripts/telegramSmoke.ts`
- Update: `tests/mediaHelperRouting.test.ts`
- Update: `tests/telegramSmoke.test.ts`

### Admin Dashboard XSS

- Modify: `src/lib/adminWebServer.ts`
- Update: `tests/adminWebServer.test.ts`

### Audio TTS No-Op Normalization

- Modify: `src/lib/audioTts.ts`
- Verify: `tests/audioTts.test.ts`

### Security Settings Follow-Up

- Review in GitHub UI: `https://github.com/dex-agent/dex-agent/security`
- No code change required for `Dependabot alerts` or `Private vulnerability reporting`

---

## Chunk 1: Sensitive Logging Alerts

### Task 1: Mask `dex-print` Dry-Run Chat Identifiers

**Files:**

- `skills/dex-print/scripts/send-dex-print.mjs`
- `tests/mediaHelperRouting.test.ts`

- [ ] Add a small masking helper near the dry-run output code.

Suggested behavior:

```js
function maskChatId(chatId) {
  if (!chatId) return null;
  const value = String(chatId);
  if (value.length <= 4) return "[redacted]";
  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}
```

- [ ] Change dry-run JSON output so `chat_id` is masked or replaced by `chat_id_present: true`.
- [ ] Keep `chat_id_source` if it does not expose the raw value.
- [ ] Ensure non-JSON dry-run output does not print raw `chat_id`.
- [ ] Add or update tests to assert raw chat IDs are absent and source/presence remains visible.

Run:

```bash
node --import tsx --test tests/mediaHelperRouting.test.ts
```

Expected: PASS.

### Task 2: Remove Raw Env-Derived Username From `telegramSmoke` Mismatch Logs

**Files:**

- `scripts/telegramSmoke.ts`
- `tests/telegramSmoke.test.ts`

- [ ] Replace the mismatch log with a message that does not echo the raw `EXPECTED_BOT_USERNAME` value.

Suggested output:

```ts
console.error("Bot username mismatch.");
```

- [ ] Optionally include a masked actual username only if the existing setup workflow needs it.
- [ ] Add or update tests so a mismatched expected username does not appear in stderr.

Run:

```bash
node --import tsx --test tests/telegramSmoke.test.ts
```

Expected: PASS.

---

## Chunk 2: Audio TTS No-Op Alerts

### Task 3: Remove Identity Replacements

**Files:**

- `src/lib/audioTts.ts`
- `tests/audioTts.test.ts`

- [ ] Remove `.replace(/\bTelegram\b/g, "Telegram")`.
- [ ] Remove `.replace(/\bCodex\b/g, "Codex")`.
- [ ] Keep meaningful replacements for acronyms and split product names.

Run:

```bash
node --import tsx --test tests/audioTts.test.ts
```

Expected: PASS with unchanged spoken normalization behavior.

---

## Chunk 3: Admin Dashboard XSS Alert

### Task 4: Add Explicit XSS Regression Coverage

**Files:**

- `tests/adminWebServer.test.ts`

- [ ] Add a test using a malicious `workdir`, such as:

```text
C:/tmp/\"><script>alert(1)</script>
```

- [ ] Assert the response does not include raw `<script>` or raw injected attributes.
- [ ] Assert the escaped form is present where useful.
- [ ] Add malicious values in at least one snapshot text field if CodeQL continues to flag the full dashboard render path.

Run:

```bash
node --import tsx --test tests/adminWebServer.test.ts
```

Expected: FAIL before hardening if the current escaping is insufficient, PASS after the code change.

### Task 5: Harden The HTML Rendering Boundary

**Files:**

- `src/lib/adminWebServer.ts`

- [ ] Keep escaping at every interpolation boundary.
- [ ] Make the URL attribute safety clearer by splitting text escaping from attribute escaping if needed.
- [ ] Ensure `refreshHref` is encoded before attribute escaping.
- [ ] Ensure `renderErrorHtml` escapes thrown messages.

Run:

```bash
node --import tsx --test tests/adminWebServer.test.ts
```

Expected: PASS.

---

## Chunk 4: Full Verification

### Task 6: Run Focused Security Regression Tests

- [ ] Run:

```bash
node --import tsx --test tests/mediaHelperRouting.test.ts
node --import tsx --test tests/telegramSmoke.test.ts
node --import tsx --test tests/audioTts.test.ts
node --import tsx --test tests/adminWebServer.test.ts
```

Expected: all PASS.

### Task 7: Run Repository Gate

- [ ] Run:

```bash
npm run check
npm run lint
npm run format:check
npm test
npm run healthcheck
```

Expected: all PASS.

- [ ] Run `npm run healthcheck:live` only if real credentials are available and this is a production-facing release.

---

## Chunk 5: GitHub Security Closure

### Task 8: Push And Verify CodeQL

- [ ] Commit with a focused message, for example:

```bash
git commit -m "fix: remediate codeql security alerts"
```

- [ ] Push the branch.
- [ ] Open GitHub Security Code scanning.
- [ ] Confirm the 5 alerts are closed or replaced by narrower residual findings.
- [ ] If any alert remains, inspect the new path and return to the smallest relevant chunk.

### Task 9: Decide Repository Security Settings

- [ ] Review `Private vulnerability reporting`.
- [ ] Review `Dependabot alerts`.
- [ ] Enable each setting if repo ownership policy allows it.
- [ ] If either stays disabled, document the reason in the final report or follow-up issue.

---

## Done Criteria

- [ ] No raw chat IDs or env-derived expected usernames are logged by default in the remediated paths.
- [ ] Audio normalization no longer contains identity replacements.
- [ ] Admin dashboard has XSS regression coverage and explicit escaping.
- [ ] Focused tests pass.
- [ ] Full repository gate passes.
- [ ] GitHub CodeQL shows the 5 current alerts closed, or every residual alert has a documented owner and next step.

---

## Flow Routing

- Current phase: Planejamento
- Owner: Paula Planeja
- Cooperacao material: Fernanda do Fluxo for routing, Chato for security-alert skepticism
- `next:` Construir
- Construir owner: Ivo Implementa with `duda-dev` if patch spans multiple files
- Required return paths:
  - `back_to: Planejamento` if a repository setting decision blocks the scope
  - `back_to: Construir` if CodeQL stays open after the patch
  - `next: Revisar` after focused tests pass
  - `next: Testar` after review
  - `next: Veredito` after repository gates and GitHub verification
