# UI tests (Playwright)

Automated UI tests for Houston. They drive the **full desktop UI** (`app/src`) as
it runs in a browser (`packages/web`), on the **new TS engine** adapter in
**control-plane mode**, against an **in-memory fake host** — no real backend, no
AI provider, no credentials. Deterministic and hermetic.

Because `packages/web` composes `app/src` verbatim, these tests cover the desktop
app's UI too: it's the same React tree. (True Tauri-shell E2E would need
`tauri-driver`, which doesn't run on macOS and only adds OS-glue coverage.)

## Run

```bash
pnpm --filter houston-web test:e2e        # headless, starts both servers itself
pnpm --filter houston-web test:e2e:ui     # Playwright UI mode (watch / debug)
pnpm --filter houston-web test:e2e:report # open the last HTML report
pnpm --filter houston-web typecheck:e2e   # typecheck the harness
```

Playwright boots two servers automatically (see `playwright.config.ts`):

1. **vite** with `VITE_NEW_ENGINE=1` on `:1430` — aliases `@houston-ai/engine-client`
   to the new-engine adapter and mounts `NewEngineRoot` (`packages/web/src/main.tsx`).
2. the **fake host** (`bun run e2e/fake-host/server.ts`) on `:4399`.

## How it works

```
e2e/
  fake-host/        # a Bun HTTP server: control plane + per-agent runtime, in-memory
    server.ts       #   entry: CORS, /v1/*, /agents/*, test-control routes
    routes.ts       #   per-agent dispatch + the chat SSE stream (the interesting bit)
    state.ts        #   seed + mutations; .houston/** files-first store (the board)
    sse.ts          #   Server-Sent Events helpers (chat turn + /v1/events feed)
    ports.ts        #   shared ports + the seeded agent id
  support/
    seed.ts         # localStorage + window.__HOUSTON_CP__ primed before any app script
    fixtures.ts     # the `test`/`expect` used by specs (resets the host per test)
  *.spec.ts         # the tests
```

**Boot.** A browser tab has no Tauri supervisor, so `support/seed.ts` primes
`localStorage` (engine config + `houston.pref.*`) and sets `window.__HOUSTON_CP__`
via `page.addInitScript` — before any app script runs. That skips the engine
Connect screen, forces `en` (stable text assertions), accepts the disclaimer, and
runs the adapter in control-plane mode (matching the real cloud/desktop-host
deployment).

**Chat.** The new engine has no WebSocket — a turn streams over SSE. The client
subscribes to `GET …/conversations/:id/events` first, then POSTs the message
(fire-and-forget 202). The fake host registers the open stream and, when the
message lands, pushes a canned reply (`text` deltas → `usage` → `done`), exactly
like the real runtime (`packages/runtime-client` + `engine-adapter/translate.ts`).

**Board.** The mission board is files-first: it reads/writes
`.houston/activity/activity.json` through `/agents/:id/agentfile/*`. The fake host
backs that with a real in-memory store, seeded with two missions, and unified with
the `/agents/:id/activities` route (same data, as in the real control plane) so a
turn flipping a card's status shows up on the board.

**Isolation.** One fake-host process serves the whole run, so the suite is serial
(`workers: 1`) and `support/fixtures.ts` resets the host (`POST /__test__/reset`)
before each test.

## Adding a spec

1. `import { test, expect } from "./support/fixtures"` (gives you a seeded page).
2. `await page.goto("/")` — the app boots straight to the shell, one agent
   selected.
3. Prefer role/label/text selectors; the app forces `en`, so English copy is
   stable. Reach for an existing stable anchor (e.g. `data-tour-target`) over a
   brittle one before adding a new `data-testid`.
4. Need more host behavior? Extend `fake-host/state.ts` + `routes.ts`. Set
   `FAKE_HOST_LOG=1` on the fake host to log every request it serves.
