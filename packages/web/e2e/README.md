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
    identity.ts     # sign the harness in as a known user (see Signed-in specs below)
    settings-nav.ts # the rail's anchorless rows (Admin + its sections and
                    # Analytics lenses, About me) and Settings
    team-nav.ts     # the rail (top-level rows + the Inbox) + the screen ON THE
                    # GLASS; open a team's section, and an agent's settings page
                    # through it ("focused agent screen", the ONE door onto agent policy)
    tour-nav.ts     # arm the guided tour from the footer's help control
    sidebar-create.ts # the rail band's ONE "+" menu: new agent / new team
    global-setup.ts # warms the vite dev server once before the suite (see CI below)
  mobile/           # phone-project specs (see Mobile below)
  *.spec.ts         # the tests
```

**Mobile.** The `mobile` Playwright project (Pixel 7: 412px logical width,
touch, mobile UA) runs ONLY `e2e/mobile/` — phone coverage is written into
that directory deliberately, spec by spec, rather than re-running the desktop
suite at a width it was never written for. It rides the default `test:e2e`
run (and therefore the CI shards): this is the standing gate that keeps the
phone layout from rotting. The tier-1 set walks the core journey — sign-in
(`mobile/sign-in.spec.ts`, against the identity-ON server via
`test.use({ baseURL: AUTH_WEB_URL })`), boot + overflow smoke, Agents home,
mission chat push, hardware back, board pager + tab bar, and Routines
(`mobile/routines.spec.ts`: list → a routine's own screen), and first-run
(`mobile/onboarding.spec.ts`: the survey, then the whole in-app setup over
the phone shell — drawer rows, provider connect, first agent, first task).
Specs `.tap()`
rather than `.click()` and assert zero horizontal overflow
(`document.documentElement.scrollWidth - clientWidth <= 0`).

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

**Signed-in specs.** The default server bakes no Firebase key, so
`isIdentityConfigured()` is false and the session is always `null`. That is fine
for almost everything, but a surface gated on a signed-in identity is then
UNREACHABLE — `useOrgPeople` / `useUserProfiles` never even fetch — and anything
that must know WHO is looking (`currentUserId`, e.g. the @mention self-chip) has
no answer. `support/identity.ts` closes that gap: pair `test.use({ baseURL:
AUTH_WEB_URL })` with `signInAsViewer(page)` and the spec runs on the identity-ON
server (`:1435`, the one the sign-in spec uses), signed in as `E2E_VIEWER`
(`uid: "u-self"`) through the app's REAL passwordless email screen. Only the
NETWORK is mocked — the gateway's OTP contract plus GCIP's public REST wire
(`identitytoolkit` / `securetoken`) — so nothing reaches into firebase-js-sdk's
storage internals and an unmocked identity call fails loudly instead of escaping
to Google. Arm the fake host's org roster with the same `u-self` id and "me" is
assertable (`chat-mentions.spec.ts`).

**File download MIME types.** The Files tab BRANCHES on the served
`Content-Type` to decide whether a list row / grid card paints a thumbnail, so
the fake host imports the REAL host's `mimeFor` (`packages/host/src/turn/files.ts`)
for `files/download` rather than re-implementing it. A PNG comes back as
`image/png` against the mock exactly as it does in production, and no spec needs
to patch the header.

**Teams / integrations arming.** Single-player alone can't reach the Teams-shaped
state the locked browse rows (and, later, the admin policy pages) need. Two
controls arm it (documented in the `@houston/fake-host` README):

- `POST /__test__/capabilities` (`Partial<Capabilities>`) — merge a partial into
  `/v1/capabilities`. `{ integrations:["composio"], multiplayer:true,
  teams:true, role:"owner" }` puts the app into Teams mode;
  `{ integrations:["composio"] }` alone is single-player-with-apps.
- `POST /__test__/agent-settings` (`{ allowedToolkits?, orgAllowedToolkits?,
  allowedModels?, access? }`) — the Teams v2 ceilings the fake host serves at
  `/v1/agents/:slug/settings` + `/v1/org/settings`. `null` = unrestricted,
  `[]` = none. (The per-agent Integrations tab that turned the effective
  allowlist into locked browse rows went away with the agent tab shell; the
  ceilings are now edited on the agent settings page's Apps section.)

**C8 Spaces arming.** The fake host serves the whole cross-org surface
(`@houston/fake-host` `routes-spaces.ts`): `GET /v1/orgs` → `{orgs, invites}`,
`POST /v1/orgs`, and the invitee's own `POST /v1/org-invites/:id/accept` /
`DELETE /v1/org-invites/:id`. `POST /__test__/space-invites` arms the invite
inbox and can force a per-invite `needs_upgrade` / `already_member` /
`invite_not_found` rejection; pair it with `/__test__/capabilities`
`{ spaces:true }`, because the sidebar cards are capability-gated on the client
(`team-invites.spec.ts`).

**C13 agent-teams arming.** `POST /__test__/agent-teams`
(`{ teams: [{ id, name, isDefault?, sortOrder?, agentIds?, members? }],
personalSpace? }`) arms the server-owned team world `GET /v1/org/teams` serves —
who is in each team, which agents it holds, and who owns it. Pair it with
`/__test__/capabilities` `{ agentTeams:true }` (the client feature-detects on the
capability, never on the data) and with `/__test__/org` `{ agents, members }`,
because a team is only as real as the fleet and roster behind it. That is the
whole setup for `agent-teams.spec.ts`: the rail listing only the teams the caller
is in, creating a team with the TYPED name, a drag that writes
`PUT /v1/agents/:slug/team` and rolls back on a refusal, and focused agent screen'
Members card. Browsing and JOINING other teams is dead product: a member only
ever sees the teams they are part of, people are added through the Members card,
and the rail's "+" is New agent · New team. `personalSpace: true` arms the space
a user has to themselves: the teams behave exactly the same there (real list,
create/patch/delete, the agent move), but every PEOPLE affordance is gone from
the client, no Members card, because the gateway refuses the member writes with
`403 personal_space`. With the capability off
the client runs the pre-C13 local `sidebar_layout` backend unchanged, which is
what `sidebar-teams.spec.ts` / `sidebar-dnd.spec.ts` /
`team-manager-gate.spec.ts` already guards.

The seeded catalog (`SEED_TOOLKIT_SLUGS`, exported for specs) holds 15 A-Z apps,
enough that a tight allowlist blocks past the locked preview cap (8) so the
"+N more" overflow is exercisable.

**Board.** The mission board is files-first: it reads/writes
`.houston/activity/activity.json` through `/agents/:id/agentfile/*`. The fake host
backs that with a real in-memory store, seeded with two missions, and unified with
the `/agents/:id/activities` route (same data, as in the real host) so a
turn flipping a card's status shows up on the board.

**Isolation.** The suite runs fully parallel: every Playwright worker starts its
OWN in-process fake host (`support/fixtures.ts`) on a worker-slot port —
`FAKE_HOST_PORT` in `@houston/fake-host` reads Playwright's
`TEST_PARALLEL_INDEX`, so a worker's specs, seed, and fixtures all resolve
`FAKE_HOST_URL` to that worker's host with no plumbing. Workers are separate OS
processes, so their in-memory host state never crosses; within a worker,
`support/fixtures.ts` resets the host (`POST /__test__/reset`) before each test.
The `webServer` fake host on the base port only serves the main process
(global-setup's warm-up). Running several worktrees' suites at once? Space the
per-worktree `HOUSTON_E2E_FAKE_HOST_PORT` bases ≥ 32 apart so worker slots
can't overlap.

**CI.** The web job shards the suite across runners (`test:e2e --shard=N/6`,
see `.github/workflows/ci.yml`) with ONE worker per shard: one single-threaded
vite dev process serves every worker's page boots, and on a 4-vCPU runner
concurrent workers starve renders — 4 workers blew expect budgets outright,
and even 2 left the signed-in specs flaking on stuck-animation transients
(duplicate `AnimatePresence` card ghosts). Throughput comes from the shards;
each test runs at the single-worker density the suite has always been stable
at.

vite dev compiles modules on demand, and Playwright only waits for the dev
server's port to open, not for it to compile. `support/global-setup.ts` boots the
shell once before the timed suite so the first test doesn't eat vite's cold
compile inside its 10s assertion budget — that cold start used to time out the
first test, which then passed on retry: a "flaky" green that silently hid a real
failure. `test:e2e` also runs with `--fail-on-flaky-tests`, so a test that only
passes on retry now fails the run (non-zero exit) instead of going green. Locally
`retries: 0`, so a failure is just a failure and the flag is a no-op.

**Two vite servers, two dep-optimizer caches.** The run boots TWO vite servers
from this same package — the identity-off shell (`:1430`) and the identity-on
sign-in server (`:1435`, the `auth` project). Vite's default cacheDir is
`node_modules/.vite`, so both would share ONE dep-optimizer output dir and, on a
cold CI cache, race: each cold-optimizes and rewrites `deps/` under the other,
invalidating chunks mid-navigation so the second server's page reloads into a
broken optimize state and never settles (the sign-in button never appears;
global-setup times out — passed locally where the cache was already warm).
`vite.config.ts` scopes `cacheDir` to the server's port (`node_modules/.vite/dev-<port>`)
so each server gets its own optimizer output — no shared state, no race.

## Adding a spec

1. `import { test, expect } from "./support/fixtures"` (gives you a seeded page).
2. `await page.goto("/")` — the app boots straight to the shell, onto the FIRST
   team's Tasks board (there is no global board; the Inbox is where boot
   waits when no team has resolved), one agent selected.
3. Prefer role/label/text selectors; the app forces `en`, so English copy is
   stable. Reach for an existing stable anchor (e.g. `data-tour-target`) over a
   brittle one before adding a new `data-testid`.
4. Need more host behavior? Extend `@houston/fake-host` (`src/state.ts` +
   `src/routes.ts`). Set `FAKE_HOST_LOG=1` on the fake host to log every request
   it serves.

## Visual regression (`e2e/visual/`)

Pixel baselines for the key screens, so design drift becomes visible. They run
as their own Playwright **`visual` project** — never inside `test:e2e`, so the
functional suite and CI are unchanged.

```bash
pnpm --filter houston-web test:visual          # compare against committed baselines
pnpm --filter houston-web test:visual:update   # re-record baselines (intentional change)
```

**Covered** (`toHaveScreenshot`, full-page; 1280×800 by default, phone shots
set a 390×844 viewport per test):

| Screen | Themes | Spec |
| --- | --- | --- |
| Mission board (home: the first team's) | light + dark, and one 640px narrow run | `shell.visual.spec.ts` |
| Phone shell (Agents home + bars), board pager, mission chat, agent missions | light + dark each | `shell.visual.spec.ts` |
| Phone Routines list + a routine's own screen | light + dark each | `routines.visual.spec.ts` |
| Chat conversation (settled reply) | light + dark | `chat.visual.spec.ts` |
| Chat markdown | light + dark | `chat-markdown.visual.spec.ts` |
| First-run language gate | one (the flow pins `data-theme="light"` itself) | `onboarding.visual.spec.ts` |

Theme is pinned by setting `data-theme` on `<html>` before the app mounts
(`visual/support.ts` `seedTheme`) — NOT the `houston.pref.theme` preference: the
web entry (`NewEngineRoot`) never runs the desktop's `loadTheme` bootstrap, so
that pref is inert here.

The visual scripts cap parallelism at `--workers=2`: full-page screenshots are
CPU-heavy, and at higher worker counts the pinned CI container starves renders
past the expect budget (a first-paint anchor missed its 10s window at 4
workers). Two workers keep the 8-shot suite fast without contention; the
determinism rules below outrank raw speed here.

**Determinism rules** (a flaky baseline is worse than none — skip a screen you
can't make deterministic rather than commit one):

- Fixed viewport + `animations: "disabled"` + `caret: "hide"` + `scale: "css"`
  (config-wide `expect.toHaveScreenshot`), with a small `maxDiffPixelRatio`
  tolerance for antialiasing.
- Capture only SETTLED states — for chat, wait for the fake host's canned reply
  (`/Roger that\. You said:/`) so no streaming delta or typing caret is in the
  frame.
- These screens carry no live clock (kanban cards only sort by `updatedAt`, they
  don't render it; chat bubbles render no timestamp) and the fake host seeds
  fixed timestamps (`state-store.ts` `EPOCH`), so no masking is needed. If you
  add a screen with a timestamp / spinner / other live region, freeze it with
  fixtures or `mask:` — do not commit a moving baseline.

**Updating baselines intentionally.** When a UI change is deliberate, re-record
with `test:visual:update`, eyeball the new PNGs under
`e2e/visual/__screenshots__/`, and commit them in the same PR as the change so
the diff documents the visual delta.

`test:visual:update` passes a BARE `--update-snapshots`, which Playwright reads
as `changed`: it rewrites only the baselines that actually failed. A screen that
moved but stayed under `maxDiffPixelRatio` is therefore reported clean and left
stale. When you know a screen changed, force it and scope it to the specs that
changed, so nothing else is churned:

```bash
pnpm exec playwright test --project=visual --update-snapshots=all \
  e2e/visual/shell.visual.spec.ts e2e/visual/chat.visual.spec.ts
```

**Platforms.** Baselines are platform-suffixed (`…-<platform>.png`). Both
`darwin` (local/agent gate) and `linux` (CI) baselines are committed; regenerate
the Linux set in the official Playwright container so a CI render matches.
Mount a COPY of the worktree rather than the worktree itself: the container
installs a linux-native dependency tree, and letting it write `node_modules` in
place leaves the darwin checkout with linux binaries.

```bash
# from the repo root
rsync -a --exclude node_modules --exclude .git --exclude dist --exclude target \
  ./ ../linux-visual/
docker run --rm -v "$PWD/../linux-visual":/w -w /w/packages/web \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c "corepack enable && pnpm install --frozen-lockfile && \
    pnpm exec playwright test --project=visual --update-snapshots=all --workers=1"
# then copy the regenerated *-linux.png back into e2e/visual/__screenshots__/
```

`--workers=1` is load-bearing in the container: with two workers the paired
dev servers starve each other and the app never gets past its loading screen,
so every test times out waiting for the shell.

Docker Desktop on macOS does not reliably share `/private/tmp/...` scratch
paths — a mount can show up partially empty inside the container. Keep the copy
under `$HOME` (e.g. beside the worktree) and the mount is whole.
