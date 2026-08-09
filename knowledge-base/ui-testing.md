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

**Parallel agent-task worktrees: ALWAYS override the ports.** `webServer` uses
`reuseExistingServer` locally, and Playwright only checks that the PORT is open,
not WHOSE server it is. If another task workspace already has a vite dev server
on `:1430` (or a fake host on `:4399`), the suite silently runs against that
FOREIGN worktree's code — symptoms: global-setup times out waiting for "Your
Agents", the app boots to the wrong gate, absurd run durations. Before running
e2e in an `_agent-tasks/<id>/` worktree, pick distinct ports:
`HOUSTON_E2E_WEB_PORT=<p> HOUSTON_E2E_FAKE_HOST_PORT=<q> pnpm test:e2e`
(the auth server derives `WEB_PORT+5` automatically).

## Architecture

- **Fake host** — the shared **`@houston/fake-host`** package
  (`packages/fake-host`), NOT a folder under `e2e/`. Node HTTP server modelling
  the host (`/agents/*`, `/v1/events`) + per-agent runtime proxy
  (`/agents/:id/conversations/:cid/*`, auth, providers). In-memory, seeded,
  resettable. Its routes, `/__test__/*` controls and `startFakeHost` API are
  documented in that package's README; `packages/web/e2e/` keeps only the glue.
- **Boot seed** (`e2e/support/seed.ts`) — `addInitScript` primes `localStorage`
  (engine config + `houston.pref.*`) + `window.__HOUSTON_CP__` before any app
  script. Skips Connect screen, language picker, disclaimer. Forces `en`.
- **Fixtures** (`e2e/support/fixtures.ts`) — `test`/`expect`. Resets the host
  (`POST /__test__/reset`) before each test.
- **Parallelism: `fullyParallel: true`, one fake host PER WORKER.** Every
  Playwright worker starts its OWN in-process fake host on a worker-slot port —
  `resolveFakeHostPort` (`packages/fake-host/src/config.ts`) reads Playwright's
  `TEST_PARALLEL_INDEX` and returns `base + 1 + slot` (base `4399`, overridable
  via `HOUSTON_E2E_FAKE_HOST_PORT`). A worker's specs, seed and fixtures all
  resolve `FAKE_HOST_URL` in-worker, so they land on that worker's host with no
  plumbing, and workers are separate OS processes so their in-memory state never
  crosses. The `webServer` fake host on the BASE port serves only the main
  process (global-setup's warm-up); vite is shared by all workers.
- **Worker count is not the same as isolation.** `workers: process.env.CI ? 1 :
  undefined` — locally Playwright picks from the machine's cores; **CI runs ONE
  worker per runner** and gets throughput from sharding instead (one
  single-threaded vite serves every worker's page boots, and on a 4-vCPU runner
  concurrent workers starve renders past the 10s expect budget). Space
  per-worktree `HOUSTON_E2E_FAKE_HOST_PORT` bases ≥ 32 apart so worker slots
  can't overlap.

## Wire facts the mock mirrors exactly

- **Chat = SSE, no WebSocket — resumable, sequenced, turn-stamped.** Subscribe
  `GET …/conversations/:id/events` FIRST, then `POST …/messages` (202, with a
  `nonce` echoed on the `user` frame). The fake host (`@houston/fake-host`
  `chat.ts`) is built from the SAME shared pieces as the real servers: `StreamChannel`
  (publish ordering + seq authority + replay buffer), `serveResumableStream`
  (the connect stitch: fresh → `sync`, `?after=<seq>` → gap/dupe-free replay,
  unserviceable cursor → `sync` + `resync: true`), and `formatSseFrame` (the
  `id:`/`data:` encoding). Every turn-scoped frame carries `turnId`, and
  history persists the user message at turn start + the reply at turn end
  (both turn-stamped) — the identity contract `engine-adapter/turn-sink.ts`
  matches against. Test controls (`@houston/fake-host` `chat-controls.ts`):
  `POST /__test__/drop-chat-streams` (sever streams mid-turn, reconnect spec),
  `POST /__test__/chat-config` (`{ replyDelayMs }`),
  `POST /__test__/kill-turn` (synthesize the dead-pump reaper's terminal
  error — the dead-turn spec), `POST /__test__/turn-boundary`
  (`{ nextText }`; end the running turn unseen + start the next one — the
  settle-from-history-by-turnId spec), and `POST /__test__/chat-interaction`
  (`{ interaction }`; end the next turn's `done` frame on that
  `pendingInteraction` — the composer question/connect card spec), plus
  `POST /__test__/chat-history` (`{ conversationId, messages, agentId? }`;
  replace a transcript verbatim — the only way to reach a SHARED conversation
  whose user messages carry the `author` the gateway stamps, for the sender
  attribution spec `chat-senders.spec.ts`; the same control seeds a message's
  `mentions[]` and an agent reply naming a person for the @mention spec
  `chat-mentions.spec.ts`, whose roster comes from `POST /__test__/org`
  → `GET /v1/org/people`).
- **Board = files-first.** Reads/writes `.houston/activity/activity.json` via
  `/agents/:id/agentfile/*` (NOT just `/activities`). Fake host backs it with a
  real store, unified with `/activities` (same data, as in the real host),
  so a turn's status flip shows on the board. Both seeded missions also carry
  Teams attribution (`created_by` + `contributors`; 2 people and 7 people), so
  the card face stacks + "+N" chip are testable — in multiplayer only, since the
  toolbar's person filter (`MissionPersonFilter`, active board only) is the surface
  that reads them. Single-player runs (and every visual baseline) see the board
  unchanged.
- **Teams mode is armable.** Single-player alone can't reach the Teams-shaped
  state (multiplayer + an integration allowlist ceiling) the agent's app-ceiling
  surfaces need. Two fake-host controls arm it:
  `POST /__test__/capabilities` (merge a `Partial<Capabilities>` into
  `/v1/capabilities` — e.g. `{ integrations:["composio"], multiplayer:true,
  teams:true, role:"owner" }`) and `POST /__test__/agent-settings`
  (`{ allowedToolkits?, orgAllowedToolkits? }`, the ceilings served at
  `/v1/agents/:slug/settings` + `/v1/org/settings`). The effective allowlist
  (agent ∩ org) is what the agent settings page's Apps section edits;
  `SEED_TOOLKIT_SLUGS` (15 A-Z apps) is exported for specs arming allowlists
  over the catalog. (The locked-browse-rows spec these controls were built for
  went with the per-agent Integrations tab.)
- **C8 Spaces is armable end to end.** The fake host serves the cross-org
  surface (`@houston/fake-host` `routes-spaces.ts`): `GET /v1/orgs` → `{orgs, invites}`,
  `POST /v1/orgs`, and the INVITEE's `POST /v1/org-invites/:id/accept` (201
  `{org}`) / `DELETE /v1/org-invites/:id` (204). Memberships have ONE source of
  truth — the team-space rows `/v1/workspaces` bridges — so an accepted invite
  lands in the switcher AND in `orgs` in one move. `POST /__test__/space-invites`
  (`{invites:[{orgName, role?, invitedBy?, orgSlug?, id?, reject?}]}`) arms the
  inbox; `reject` forces that invite's `needs_upgrade` (403) / `already_member`
  (409) / `invite_not_found` (404), whose bodies are the gateway's flat
  `{error, code}` — the shape the client's invite taxonomy reads. The sidebar
  cards are capability-gated on the CLIENT, so pair with
  `/__test__/capabilities` `{spaces:true}` (`team-invites.spec.ts`).
- **C13 server-owned agent teams are armable.** `POST /__test__/agent-teams`
  (`{ teams: [{ id, name, isDefault?, sortOrder?, agentIds?, members? }],
  personalSpace? }`) replaces the team world served at `GET /v1/org/teams`
  wholesale — who is in each team, which agents it holds, who owns it; an
  omitted or `null` `teams` clears it back to lazy so the next read mints the
  default team again. The rest of the surface
  (`@houston/fake-host` `routes-agent-teams.ts`) covers create / rename /
  reorder / delete, `…/:id/members`, self-service `…/:id/join`, and
  `PUT /v1/agents/:slug/team`. Pair with `/__test__/capabilities`
  `{ agentTeams:true }` — the client feature-detects on the **capability**,
  never on the data — and with `/__test__/org` `{ agents, members }`, since a
  team is only as real as the fleet and roster behind it
  (`agent-teams.spec.ts`). With the capability OFF the client runs the pre-C13
  local `sidebar_layout` backend, which `sidebar-teams.spec.ts` /
  `sidebar-dnd.spec.ts` / `team-settings-manager.spec.ts` guard.

## CI

`.github/workflows/ci.yml` (the repo's only PR gate — others fire on tags).

- The **`web`** job is a **6-way shard matrix** (`shard: [1..6]`), each runner
  executing `test:e2e --shard=<n>/6` with ONE worker. Throughput comes from the
  shards, not from workers per runner.
- Typecheck (`typecheck` + `typecheck:e2e`) and the unit suite ride **shard 1
  only**. The unit script is `pnpm --filter houston-web test` =
  `vitest run ./tests ./src --testTimeout=30000` — `./src` is covered too.
- Each shard uploads its own Playwright HTML report:
  **six** `playwright-report-shard-<n>` artifacts.
- A separate **`visual`** job runs `test:visual` inside the pinned Playwright
  container (see Visual regression below) and uploads
  `playwright-visual-report`.
- `test:e2e` runs with `--fail-on-flaky-tests`, so a test that only passes on
  retry fails the run instead of going green.

## Add a spec

`import { test, expect } from "./support/fixtures"` → `await page.goto("/")` →
boots to **Mission Control** (there is no per-agent screen), one agent current.
Prefer role/label/text selectors (en is forced). Reuse a stable anchor (e.g.
`data-tour-target`) before adding a `data-testid`. Need more host behavior?
Extend `@houston/fake-host` (`packages/fake-host/src/state.ts` + `routes.ts`;
`FAKE_HOST_LOG=1` logs every request it serves).

**Two rules the teams shell adds.**

- **Scope to the screen on the glass.** Every top-level view is kept alive, so
  several screens sit in the DOM at once and only one is displayed — a mission
  card exists on Mission Control AND on its team's board. A bare page-level
  `getByText` therefore matches hidden copies (strict-mode violation at best, a
  click on an invisible element at worst). Use `screen(page)` from
  `support/team-nav.ts`, which reads the `data-screen-active` marker
  `KeepAliveViews` stamps on the visible screen.
- **Navigate with `support/team-nav.ts`.** `openTeamSection(page, "Routines" |
  "Files" | "Mission Control" | "Team Settings")` and `openAgentSettings(page,
  agentName, section?)` are the one spelling of the two paths that replaced the
  agent tab strip. `support/mission.ts` `openNewMission(page)` covers the other
  shift: every board is cross-agent, so "New mission" asks WHICH agent first.

## Visual regression (`e2e/visual/`)

Pixel baselines for the key screens, so design drift becomes visible. They run
as their OWN Playwright **`visual` project** — never inside `test:e2e`, so the
functional suite (and its CI job) stay unchanged.

```bash
pnpm --filter houston-web test:visual         # compare against committed baselines
pnpm --filter houston-web test:visual:update  # re-record (intentional change only)
```

- **Covered** — four specs, 8 shots per platform (full-page, animations + caret
  frozen via `playwright.config.ts` `toHaveScreenshot`; the `visual` project
  pins a 1280×800 viewport):
  - `shell.visual.spec.ts` — mission board, light + dark + one 640px narrow run.
  - `chat.visual.spec.ts` — chat settled reply, light + dark.
  - `chat-markdown.visual.spec.ts` — markdown inside chat bubbles, light + dark.
    The agent bubble renders the fake host's fixed `MARKDOWN_SHOWCASE`; the user
    bubble pins that typed markdown stays VERBATIM. Overrides the viewport to
    **1280×1550** (`test.use`), because at 800px the scroller crops the user
    bubble and top headings out of the frame.
  - `onboarding.visual.spec.ts` — first-run language gate (the flow pins
    `data-theme="light"` itself, so one shot).
- **The visual scripts cap parallelism at `--workers=2`.** Full-page screenshots
  are CPU-heavy and the pinned CI container starves renders past the expect
  budget above that.
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
- **`test:visual:update` only rewrites baselines that FAILED.** Playwright's bare
  `--update-snapshots` means `changed`, so a baseline that drifted but stayed
  under `maxDiffPixelRatio` is left exactly as it was — the update script reports
  a clean run and writes nothing, and the stale PNG goes on standing in for the
  screen. When you KNOW a screen moved, force it:
  `playwright test --project=visual --update-snapshots=all <spec files>`, scoped
  to the specs that actually changed so unrelated baselines are not churned.
  This is not hypothetical: the row-primitive entry below found all six board /
  chat baselines passing while depicting a rail that no longer existed.
- **Bless log.** A re-record that absorbs drift from EARLIER commits (not just
  the one in hand) gets a line here, so the bless is on the record instead of
  hiding inside a binary diff:
  - *2026-08-09, the teams-first freeze bless* — ALL eight screens force-
    re-recorded (`--update-snapshots=all`) on darwin AND in the pinned linux
    container, in the freeze that shipped the PageHeader family, the Safari
    lozenge track, Files v3 accordions, the Integrations header adoption and
    the search unification. This bless also absorbs the row-primitive drift
    the previous entry deferred.
  - *2026-08-08, the sidebar row-primitive unification* — **superseded: blessed
    by the 2026-08-09 entry above.**
    (original note) **DEFERRED, not yet blessed.** Every interactive line in the rail now renders through one
    `SidebarRowButton` (`ui/layout`), so the board and chat baselines no longer
    depict the rail they show. The re-record is deliberately held until the
    change is signed off in the running app, so the screens are blessed once
    instead of per iteration. **They are currently PASSING while stale**: a trial
    re-record measured the drift at 1.36% of the frame under a strict
    per-channel threshold, which sits under Playwright's own YIQ threshold, so
    `test:visual` is green and bare `test:visual:update` rewrites nothing. When
    the bless happens it needs `--update-snapshots=all` (see *Update
    discipline*), on darwin AND in the linux container, for `shell` + `chat` +
    `chat-markdown`; `board-narrow` does NOT move (at 640px the rail is a
    drawer) and `onboarding` never shows the rail.
  - *2026-08-07, teams E5 (the tab-shell cutover)* — ALL seven affected
    screens re-recorded on both platforms (14 PNGs): `board` light / dark /
    narrow, `chat` light / dark, `chat-markdown` light / dark. The agent tab
    shell is gone, so every one of them booted onto the agent's Activity tab
    before and boots onto **Mission Control** now: the title reads "Mission
    Control" instead of the agent's name, the Activity / Context / Skills /
    Integrations / Routines / Files strip is gone, the toolbar gained the agent
    filter + the Archived pill (the floating in-board pill went with the tab),
    and the columns move up by the strip's height. Verified by eye against
    current truth before committing. Note for the next bless: the board light /
    dark pair sat just UNDER `maxDiffPixelRatio: 0.01` against the old
    baselines and would have gone on passing — the strip is thin text on a light
    surface, and most of the shift is sub-threshold grey. Narrow caught it. Do
    not read a green `test:visual` as proof that a shell-level change left the
    board alone; eyeball the screen the change touches.
  - *2026-08-07, teams E4* — the four `chat` / `chat-markdown` baselines
    (light + dark, both platforms) were re-synced. They had last been recorded
    at `77a74bdf` and had drifted through four intervening commits: `419ee3f3`
    (agent Settings tab split into Context / Skills / Admin — the tab strip),
    `24c9542a` (labeled links wear the Slack chip), `1bc5236d` (the agent
    settings page), `7ee706e2` (the "Your teams" rail). Verified by eye against
    current truth before committing: the rail says "Your teams" with its
    section rows, the strip is Activity / Context / Skills / Integrations /
    Routines / Files, and the toolbar is the current search + avatar pair. The
    `shell` board baselines moved in the same change for the rail's new section
    rows, which is drift from that change alone.

Full guide (determinism rules, the Docker Linux-regen command): `packages/web/e2e/README.md`
→ Visual regression.
