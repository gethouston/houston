---
name: verify
description: Drive Houston's TS host + web UI end-to-end to verify a change against the running system (host HTTP battery + Playwright Files/board flows).
---

# Verifying Houston changes at runtime

## TS host (the real desktop sidecar), hermetically

```bash
mkdir -p /tmp/hh/workspaces/Personal/"Agent 1"
HOUSTON_HOME=/tmp/hh HOUSTON_HOST_PORT=48123 HOUSTON_HOST_TOKEN=t \
  node --import tsx packages/host/src/local/main.ts
# wait for {"status":"ok"}:
curl -s http://127.0.0.1:48123/health
```

- Auth: `Authorization: Bearer t`. Agent ids are `<Workspace>/<Agent>` —
  URL-encode the slash (`/agents/Personal%2FAgent%201/files`).
- SSE reactivity feed: `curl -N 'http://127.0.0.1:48123/v1/events?token=t'`.
- The runtime is only spawned for chat turns; files/agents routes need no
  provider credentials.

## Web UI (the same React tree the desktop ships)

Playwright + the fake host (`@houston/fake-host`), all boot handled by the
harness:

```bash
pnpm --filter houston-web test:e2e             # whole suite
cd packages/web && npx playwright test e2e/files.spec.ts --reporter=line
```

- Specs live in `packages/web/e2e/`; fixtures reset the fake host per test.
- One-off screenshots: drop a temp spec in `e2e/`, `page.screenshot(...)`,
  delete it after (testDir is pinned to `e2e/`).
- Gotchas: controlled inputs never match `input[value=…]` (use
  `getByRole("textbox")`); headless Chromium names blob downloads with a GUID —
  assert downloaded bytes, not `suggestedFilename()`.

## Gates (CI-equivalent, not a substitute for the above)

`pnpm check` · `pnpm typecheck` (ui+app+web) · `pnpm --filter @houston/host test`
· `cd app && pnpm check-locales` · `pnpm check:boundaries`
