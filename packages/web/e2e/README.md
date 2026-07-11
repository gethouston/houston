# UI tests (Playwright)

Automated UI tests for Houston. They drive the **full desktop UI** (`app/src`) as
it runs in a browser (`packages/web`), on the **host** adapter in
**host mode**, against an **in-memory fake host** — no real backend, no
AI provider, no credentials. Deterministic and hermetic.

Because `packages/web` composes `app/src` verbatim, these tests cover the desktop
app's UI too: it's the same React tree. (True Tauri-shell E2E would need
`tauri-driver`, which doesn't run on macOS and only adds OS-glue coverage.)

## Run

```bash
pnpm --filter houston-web test:e2e        # headless, starts both servers itself
pnpm --filter houston-web test:e2e:webkit # same suite on WebKit — what the desktop WKWebView runs
pnpm --filter houston-web test:e2e:ui     # Playwright UI mode (watch / debug)
pnpm --filter houston-web test:e2e:report # open the last HTML report
pnpm --filter houston-web typecheck:e2e   # typecheck the harness
```

The WebKit run needs a one-time `pnpm exec playwright install webkit`. Run it
when a change touches popovers/menus/positioning: Chromium and WebKit disagree
on overflow clipping and hit-testing (the HOU-708 color submenu was clickable
on Chromium and dead on WebKit).

Playwright boots two servers automatically (see `playwright.config.ts`):

1. **vite** with `VITE_NEW_ENGINE=1` on `:1430` — aliases `@houston-ai/engine-client`
   to the new-engine adapter and mounts `NewEngineRoot` (`packages/web/src/main.tsx`).
2. the **fake host** (`pnpm fake-host`) on `:4399`.

The fake host itself lives in the shared **`@houston/fake-host`** package
(`packages/fake-host`) — a faithful protocol-v3 in-memory host built from the
real server streaming pieces. Its routes, `/__test__/*` control endpoints, and
`startFakeHost` API are documented in that package's README. This directory keeps
only the web-e2e glue.

## How it works

```
e2e/
  config.ts         # web dev-server constants (WEB_PORT / WEB_URL) — harness glue
  support/
    seed.ts         # localStorage + window.__HOUSTON_CP__ primed before any app script
    fixtures.ts     # the `test`/`expect` used by specs (resets the host per test)
    global-setup.ts # warms the vite dev server once before the suite (see CI below)
  *.spec.ts         # the tests
```

The host itself (`@houston/fake-host`): `startFakeHost`/`stop`, the `/v1/*` +
`/agents/*` surface, the `StreamChannel` + `serveResumableStream` chat stream,
the `.houston/**` files-first store, and the `/__test__/*` controls all live in
`packages/fake-host` and are documented there.

**Boot.** A browser tab has no Tauri supervisor, so `support/seed.ts` primes
`localStorage` (engine config + `houston.pref.*`) and sets `window.__HOUSTON_CP__`
via `page.addInitScript` — before any app script runs. That skips the engine
Connect screen, forces `en` (stable text assertions), accepts the disclaimer, and
runs the adapter in host mode (matching the real cloud/desktop-host
deployment).

**Chat.** The new engine has no WebSocket — a turn streams over SSE. The client
subscribes to `GET …/conversations/:id/events` first, then POSTs the message
(fire-and-forget 202, with a `nonce` the server echoes on the turn's `user`
frame). The fake host (`@houston/fake-host` `chat.ts`) is built from the SAME shared
server pieces as the real runtime/host, so the wire cannot drift from the
contract: `StreamChannel` owns each conversation's publish ordering (seq
authority + replay buffer + snapshot), `serveResumableStream` serves every
connection (fresh connect → `sync`; `?after=<seq>` / `Last-Event-ID` →
gap/dupe-free replay; unserviceable cursor → `sync` with `resync: true`), and
`formatSseFrame` encodes the frames. Every turn-scoped frame carries the
turn's `turnId`, and history persists the user message at turn START + the
assistant reply at turn END (both turn-stamped) — the identity contract
`@houston/sdk`'s `turn-sink.ts` settles against. Test controls
(`@houston/fake-host` `chat-controls.ts`, wired under `/__test__/*`):

- `POST /__test__/drop-chat-streams` — sever every open chat stream WITHOUT
  ending the turns (a network blip; the reconnect spec).
- `POST /__test__/chat-config` (`{ replyDelayMs }`) — slow the canned reply so
  a drop/kill lands mid-turn deterministically.
- `POST /__test__/kill-turn` — synthesize the host reaper's terminal `error`
  frame (dead turn's turnId + "The turn ended unexpectedly"; the dead-turn
  settle spec).
- `POST /__test__/turn-boundary` (`{ nextText }`) — end the running turn while
  nobody watches and start the next one, so the reconnect resyncs onto a
  DIFFERENT turnId and the client must settle its turn from history by turnId
  (the turn-boundary spec).

**Teams / integrations arming.** Single-player alone can't reach the Teams-shaped
state the locked browse rows (and, later, the admin policy pages) need. Two
controls arm it (documented in the `@houston/fake-host` README):

- `POST /__test__/capabilities` (`Partial<Capabilities>`) — merge a partial into
  `/v1/capabilities`. `{ integrations:["composio"], multiplayer:true,
  teams:true, role:"owner" }` puts the agent Integrations tab into Teams mode;
  `{ integrations:["composio"] }` alone is single-player-with-apps.
- `POST /__test__/agent-settings` (`{ allowedToolkits?, orgAllowedToolkits?,
  allowedModels?, access? }`) — the Teams v2 ceilings the fake host serves at
  `/v1/agents/:slug/settings` + `/v1/org/settings`. The effective allowlist
  (agent ∩ org) splits the browse catalog into connectable vs locked rows
  (`integrations-locked.spec.ts`). `null` = unrestricted, `[]` = none.

The seeded catalog (`SEED_TOOLKIT_SLUGS`, exported for specs) holds 15 A-Z apps,
enough that a tight allowlist blocks past the locked preview cap (8) so the
"+N more" overflow is exercisable.

**Board.** The mission board is files-first: it reads/writes
`.houston/activity/activity.json` through `/agents/:id/agentfile/*`. The fake host
backs that with a real in-memory store, seeded with two missions, and unified with
the `/agents/:id/activities` route (same data, as in the real host) so a
turn flipping a card's status shows up on the board.

**Isolation.** One fake-host process serves the whole run, so the suite is serial
(`workers: 1`) and `support/fixtures.ts` resets the host (`POST /__test__/reset`)
before each test.

**CI.** vite dev compiles modules on demand, and Playwright only waits for the dev
server's port to open, not for it to compile. `support/global-setup.ts` boots the
shell once before the timed suite so the first test doesn't eat vite's cold
compile inside its 10s assertion budget — that cold start used to time out the
first test, which then passed on retry: a "flaky" green that silently hid a real
failure. `test:e2e` also runs with `--fail-on-flaky-tests`, so a test that only
passes on retry now fails the run (non-zero exit) instead of going green. Locally
`retries: 0`, so a failure is just a failure and the flag is a no-op.

## Adding a spec

1. `import { test, expect } from "./support/fixtures"` (gives you a seeded page).
2. `await page.goto("/")` — the app boots straight to the shell, one agent
   selected.
3. Prefer role/label/text selectors; the app forces `en`, so English copy is
   stable. Reach for an existing stable anchor (e.g. `data-tour-target`) over a
   brittle one before adding a new `data-testid`.
4. Need more host behavior? Extend `@houston/fake-host` (`src/state.ts` +
   `src/routes.ts`). Set `FAKE_HOST_LOG=1` on the fake host to log every request
   it serves.
