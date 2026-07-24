# UI Testing (Playwright)

Automated UI tests. Drive **full desktop UI** (`app/src`) in browser
(`packages/web`), on the **host** adapter in **host mode**, vs **in-memory fake
host**. No real backend, no AI, no creds. Deterministic.

Lives in `packages/web/e2e/`. Full guide: `packages/web/e2e/README.md`.

## Why web build, not Tauri

`packages/web` composes `app/src` verbatim — SAME React tree. Test it once =
cover desktop UI too. Real Tauri-shell E2E needs `tauri-driver` (no macOS
support, only adds OS-glue coverage). Not worth it.

## Run

```bash
pnpm --filter houston-web test:e2e        # headless (boots both servers itself)
pnpm --filter houston-web test:e2e:ui     # watch / debug
pnpm --filter houston-web typecheck:e2e   # typecheck harness
```

Playwright auto-starts three servers: vite `:1430` (identity-off shell → adapter +
`NewEngineRoot`), a second vite `:1435` (identity-ON, bakes a fake Firebase key so
`SignInScreen` renders — the `auth` project), and the fake host `:4399`
(`pnpm fake-host`).

Both vite servers run from the same package, so `vite.config.ts` scopes `cacheDir`
to the server's port (`node_modules/.vite/dev-<port>`). Without that, the two
cold-boot dep-optimizers share one `deps/` dir and race on a cold CI cache —
each rewrites the other's optimized chunks mid-navigation, wedging the sign-in
server on an endless reload so global-setup times out (passed locally, where the
cache was warm).

## Architecture

- **Fake host** (`e2e/fake-host/`) — Node HTTP server. Models the host
  (`/agents/*`, `/v1/events`) + per-agent runtime proxy (`/agents/:id/
  conversations/:cid/*`, auth, providers). In-memory, seeded, resettable.
- **Boot seed** (`e2e/support/seed.ts`) — `addInitScript` primes `localStorage`
  (engine config + `houston.pref.*`) + `window.__HOUSTON_CP__` before any app
  script. Skips Connect screen, language picker, disclaimer. Forces `en`.
- **Fixtures** (`e2e/support/fixtures.ts`) — `test`/`expect`. Resets host
  (`POST /__test__/reset`) before each test. Suite serial (`workers: 1`, one
  shared host).

## Two wire facts the mock mirrors exactly

- **Chat = SSE, no WebSocket — resumable, sequenced, turn-stamped.** Subscribe
  `GET …/conversations/:id/events` FIRST, then `POST …/messages` (202, with a
  `nonce` echoed on the `user` frame). The fake host (`fake-host/chat.ts`) is
  built from the SAME shared pieces as the real servers: `StreamChannel`
  (publish ordering + seq authority + replay buffer), `serveResumableStream`
  (the connect stitch: fresh → `sync`, `?after=<seq>` → gap/dupe-free replay,
  unserviceable cursor → `sync` + `resync: true`), and `formatSseFrame` (the
  `id:`/`data:` encoding). Every turn-scoped frame carries `turnId`, and
  history persists the user message at turn start + the reply at turn end
  (both turn-stamped) — the identity contract `engine-adapter/turn-sink.ts`
  matches against. Test controls (`fake-host/chat-controls.ts`):
  `POST /__test__/drop-chat-streams` (sever streams mid-turn, reconnect spec),
  `POST /__test__/chat-config` (`{ replyDelayMs }`),
  `POST /__test__/kill-turn` (synthesize the dead-pump reaper's terminal
  error — the dead-turn spec), `POST /__test__/turn-boundary`
  (`{ nextText }`; end the running turn unseen + start the next one — the
  settle-from-history-by-turnId spec), and `POST /__test__/chat-interaction`
  (`{ interaction }`; end the next turn's `done` frame on that
  `pendingInteraction` — the composer question/connect card spec).
- **Board = files-first.** Reads/writes `.houston/activity/activity.json` via
  `/agents/:id/agentfile/*` (NOT just `/activities`). Fake host backs it with a
  real store, unified with `/activities` (same data, as in the real host),
  so a turn's status flip shows on the board.
- **Teams mode is armable.** Single-player alone can't reach the Teams-shaped
  state (multiplayer + an integration allowlist ceiling) that the agent
  Integrations tab's locked browse rows need. Two fake-host controls arm it:
  `POST /__test__/capabilities` (merge a `Partial<Capabilities>` into
  `/v1/capabilities` — e.g. `{ integrations:["composio"], multiplayer:true,
  teams:true, role:"owner" }`) and `POST /__test__/agent-settings`
  (`{ allowedToolkits?, orgAllowedToolkits? }`, the ceilings served at
  `/v1/agents/:slug/settings` + `/v1/org/settings`). The effective allowlist
  (agent ∩ org) splits the browse catalog into connectable vs locked rows
  (`integrations-locked.spec.ts`). `SEED_TOOLKIT_SLUGS` (15 A-Z apps) is exported
  for specs arming allowlists over the catalog.

## CI

`.github/workflows/ci.yml` (the repo's only PR gate — others fire on tags). The
`web` job runs: web typecheck + `typecheck:e2e` + unit (`vitest run ./tests`) +
`test:e2e`. A separate **`visual`** job runs `test:visual` inside the pinned
Playwright container (see Visual regression below). Both upload their Playwright
HTML report as an artifact.

## Add a spec

`import { test, expect } from "./support/fixtures"` → `await page.goto("/")` →
boots to shell, one agent selected. Prefer role/label/text selectors (en is
forced). Reuse a stable anchor (e.g. `data-tour-target`) before adding a
`data-testid`. Need more host behavior? Extend `fake-host/state.ts` + `routes.ts`
(`FAKE_HOST_LOG=1` logs every request).

## Visual regression (`e2e/visual/`)

Pixel baselines for the key screens, so design drift becomes visible. They run
as their OWN Playwright **`visual` project** — never inside `test:e2e`, so the
functional suite (and its CI job) stay unchanged.

```bash
pnpm --filter houston-web test:visual         # compare against committed baselines
pnpm --filter houston-web test:visual:update  # re-record (intentional change only)
```

- **Covered** (full-page, fixed 1280×800 viewport, animations + caret frozen via
  `playwright.config.ts` `toHaveScreenshot`): mission board (light + dark + one
  640px narrow run), chat settled reply (light + dark), first-run language gate.
- **Platform-suffixed baselines.** Both `darwin` (local / agent gate) and `linux`
  (CI) PNGs are committed under `e2e/visual/__screenshots__/` — a darwin render
  won't match a Linux one pixel-for-pixel, so BOTH sets ship. Regenerate the
  Linux set inside the pinned Playwright container so a CI render matches.
- **CI** runs the `visual` job in `mcr.microsoft.com/playwright:v1.61.1-noble`
  (browsers ship in the image, no install step); the image tag MUST track
  `@playwright/test` in `packages/web/package.json` — bump both together.
- **Update discipline.** Re-record ONLY when a UI change is deliberate, eyeball
  the new PNGs, and commit them in the same PR as the change so the diff
  documents the visual delta — never blindly re-record to green a red run.

Full guide (determinism rules, the Docker Linux-regen command): `packages/web/e2e/README.md`
→ Visual regression.
