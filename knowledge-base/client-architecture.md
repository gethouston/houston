# Client architecture — the three-surface contract

**Load this FIRST, before touching any client code.** It is the maintenance
contract for Houston's multi-surface client: how behavior, look, and structure
stay identical across surfaces while each surface stays platform-native. Act
from the procedures below; they are checklists, follow them verbatim.

---

## The model (read this screen, then act)

Houston runs on **three surfaces**: **web** and **desktop** (React, shipping
today; desktop is the same `app/src` React tree in a Tauri shell) and the coming
native **iOS** (SwiftUI) and **Android** (Jetpack Compose) apps. They share three
things and deliberately differ in a fourth:

| One… | Lives in | Means |
| --- | --- | --- |
| **behavior implementation** | `@houston/sdk` (`packages/sdk`) | what a client *does* — turn lifecycle, state, reconnection, commands — is written **once**, headless. |
| **look source** | design tokens (`packages/design-tokens`) | every colour/type/space/motion value is one token, compiled to CSS + TS + Swift + Kotlin. |
| **structural contract** | component inventory (`design/inventory`) | which components exist and their anatomy/states/semantics, CI-checked per surface. |

**What deliberately DIFFERS per surface:** form, navigation, and idiom. A
SwiftUI nav stack, a Compose bottom bar, a desktop split-pane — platform-native
is a *feature*, not drift. The **model of the world is identical** (same
view-models, same tokens, same component contract); the *presentation* is native
to each platform. Never flatten a surface into a web port to save effort.

### Load-bearing invariants (violating one is the bug)

1. **No business logic in surface code.** Turn lifecycle, state folding,
   reconnection, and command semantics live in `@houston/sdk`. A surface binds
   view-models to native UI; it never re-implements them.
2. **No raw design literals.** No hardcoded hex/rgba/spacing in app or `ui/` CSS
   (or in native views). Reference a `--ht-*` token (or its Tailwind
   `--color-*`, or the native token constant).
3. **Nothing but JSON crosses the SDK surface.** Everything through
   `getSnapshot` / `subscribe` / `dispatch` / `on` is plain JSON — no functions,
   no class instances — so it survives structured-clone and the native bridge.
4. **The SDK's VM snapshots and `BRIDGE.md` are frozen contracts, evolved
   ADDITIVELY** — same discipline as protocol v3: consumers ignore unknown
   fields; producers only add optional fields; discriminated unions only gain
   members. A native host running a different minor version must never break.
   (`packages/sdk/BRIDGE.md` §4.)

---

## The map (each piece, its path, its README)

| Piece | Path | README | What lives there |
| --- | --- | --- | --- |
| **SDK** | `packages/sdk` | `packages/sdk/README.md` | Headless client. **kernel** (`store.ts` scopes/snapshots, `commands.ts` registry, `ports.ts` injected capabilities, `sdk.ts` composition); **modules** (`session`, `agents`, `conversations`, `turns`); **`react/`** subpath (`@houston/sdk/react` — `useSdkSnapshot`, `useSdkEvent`); **`bridge/`** the shipped native-bridge dispatcher (`createBridge`) + embeddable IIFE bundle (`build:bridge` → `dist/houston-sdk.bridge.js`, gitignored) that backs `fetch`/`storage` natively over the pipe and self-shims JSC globals; **`BRIDGE.md`** its wire spec (§2.1 configure, §9 native ports, §10 host polyfills). |
| **Design tokens** | `packages/design-tokens` | `packages/design-tokens/README.md` | Two-tier DTCG JSON (`tokens/primitive` + `tokens/semantic` + `tokens/scale`) → Style Dictionary → committed `dist/` (`css/tokens.css`, `ts/tokens.ts`, `swift/HoustonTokens.swift`, `kotlin/HoustonTokens.kt`). |
| **Component inventory** | `design/inventory` | `design/inventory/README.md` | `inventory.yaml` (versioned cross-surface component spec) + `manifests/{web,ios,android}.yaml` (per-surface status) + `CHANGELOG.md`. Enforced by `scripts/check-parity.mjs` (`pnpm check:parity`). |
| **Fake host** | `packages/fake-host` | `packages/fake-host/README.md` | In-memory protocol-v3 host for UI/e2e tests. Built from the SAME `@houston/runtime-client` stream pieces as the real host, so it can't drift from the wire. Consumed by `packages/web` Playwright e2e. |
| **Runtime client** | `packages/runtime-client` | (source) | The **wire layer**: `HoustonEngineClient`, resumable streams (`resume.ts` `streamEventsResumable`, `replay.ts` `ReplayLog`, `stream-channel.ts` `StreamChannel`, `stitch.ts` `serveResumableStream`), snapshot reduction (`snapshot.ts`), and the workspace-global reactivity loop (`global-events.ts` `streamGlobalEvents`). Shared by the SDK, the web adapter, the host, and the fake host. |
| **Web engine-adapter seam** | `packages/web/src/engine-adapter` | (source headers) | The delegation seam — see below. |

### The engine-adapter delegation seam and its planned fate

`packages/web/src/engine-adapter/` is the drop-in replacement for
`@houston-ai/engine-client` (aliased in `vite.config.ts` in host/new-engine
mode), letting the whole desktop UI run on the host unchanged. Convergence says
**this adapter eventually dissolves into direct SDK consumption**
(`convergence/README.md` P6 / `final-cutover.md`).

**Already migrated INTO the SDK (adapter now delegates):**

- **Turn/feed machinery** — `engine-adapter/turn-stream.ts` calls the SDK's
  `streamTurn` / `observeConversation`; `engine-adapter/stream-registry.ts` is a
  compat re-export of the SDK's `StreamRegistry`.
- **The FeedOutput seam** — `engine-adapter/feed-output.ts` implements the SDK's
  `FeedOutput` interface (`packages/sdk/src/modules/turns/feed-output.ts`), bridging SDK
  pushes onto the desktop's in-process bus. The SDK folds each frame once; the
  output decides where it lands.
- **The global-events reactivity loop** — both the SDK's agents module and the
  web adapter consume the ONE `streamGlobalEvents` in `@houston/runtime-client`.
- **The conversation VM cache is bounded** — `ConversationVmOutput` keeps folded
  transcripts in an `LruCache` (`packages/sdk/src/lru.ts`), not an unbounded map,
  so a multi-hour client's memory tracks its ACTIVE window, not total volume.
  Past `SdkConfig.conversationCacheMax` (default `DEFAULT_CONVERSATION_CACHE_MAX`
  = 50) the least-recently-published IDLE conversation is evicted and its retained
  store snapshot cleared; it re-hydrates from history on the next `observe`. A
  live conversation (running/streaming/queued/optimistic) or one with active
  subscribers is pinned and never dropped. `turns.forget(conversationId)` is the
  explicit drop for a closed/deleted conversation.

**Still adapter-side (not yet SDK):** the control-plane surface
(agents/activities/routines/skills/board/config CRUD — `client.ts`,
`control-plane.ts`, `activities.ts`, `agent-files.ts`), auth/token mirroring, and
the `synthetic.ts` old-id↔engine-id provider remapping. The SDK "wraps the
conversation/agent surface first; broader control-plane operations stay on their
current paths until migrated deliberately" (`packages/sdk/README.md`, *Out of
scope for v1*).

**The wave-1 seam (adapter → `HoustonSdk`).** `HoustonClient` (`client.ts`) now
constructs the ONE web-side `HoustonSdk` in `engine-adapter/sdk-client.ts`
(`createEngineSdk`) and holds it (exposed via the `engineSdk` getter). This is
the foundation for deleting the dual source of truth: web currently
RE-implements agents/activities/providers/integrations/preferences CRUD in
`control-plane.ts` + `client.ts` against the same routes the SDK modules already
own (the iOS app consumes those modules via the native bridge), which violates
"no business logic in surface code". Later waves delegate those adapter WRITE
bodies to `client.engineSdk.<module>` so web matches iOS.

- **Auth/active-space, one source of truth.** The SDK's `ports.fetch` is the
  SAME `gatewayAuthFetch` instance `engine` uses — live bearer, 401-refresh, and
  `x-houston-org` off the live `ControlPlaneConfig.activeOrgSlug`. `setActiveOrg`
  mutates that config in place, so the SDK reroutes with no extra wiring.
- **Read-path decision: WRITE-DELEGATION ONLY; reads stay on TanStack Query +
  the `/v1/events` bus.** The SDK is built with `SdkConfig.reactivity: false`
  (see `packages/sdk/src/ports.ts`), so its agents/activities modules do NOT open
  their own `/v1/events` streams. Routes and `/v1/events` are untouched, and web
  keeps its existing read model + `subscribeServerEvents` invalidation. Without
  this flag, constructing the SDK would open duplicate SSE subscriptions and
  refetch the agent list — a behavior change. Do NOT adopt the SDK's scope
  snapshots as the web read model unless a write method hard-depends on an
  observed scope (none do today).
- **Inert until wave 2.** Construction issues zero requests; nothing consumes
  `engineSdk` yet. Proven by `packages/web/tests/sdk-client.test.ts` and
  `packages/sdk/src/sdk.test.ts` ("reactivity flag").

**The wave-2a write seams: no-refetch write variants (`module.writes.*`).** Web
can't delegate its CRUD to the SDK's mutating FACADE methods
(`agents.create/rename/delete`, `activities.create/setStatus/rename/delete`,
`providers.setApiKey/logout/setModel`, `integrations.disconnect`) because each
does a post-write `refresh()` (an extra GET) and returns a simplified shape —
exactly the refetch web runs `reactivity:false` to avoid (web owns its TanStack
reads). So each of those four modules now also exposes a **`writes` namespace**:
the SAME underlying HTTP write, but it (a) does NOT call `refresh()` / publish a
snapshot, and (b) RETURNS the wire entity (`agents.writes.create` returns the
created agent incl. `id` for web's color overlay; `activities.writes.*` return
the wire `Activity`; `providers.writes.status` returns `AuthStatus`). The
refetching facade methods are UNCHANGED and, where sensible, now delegate to the
same `writes` primitive then `refresh()` (one implementation, no drift — see
`providers/operations.ts`). Extra additive surface landed with it:
`agents.writes.create` takes the full `{ name, claudeMd?, seeds? }` body (the
plain facade still posts `{ name }`); `providers.writes.setCustomEndpoint`
(`POST /providers/openai-compatible`, no facade sibling);
`integrations.setSession` / `dismissReconnectNotice`, an additive
`connect(provider, toolkit, agent?)` overload (the 1-arg `connect(toolkit)` and
its bridge command are byte-identical to before), and `IntegrationsClient`
(runtime-client) gained `setSession` / `dismissReconnectNotice` + optional
provider/agent on `connect`/`disconnect`. Web's actual delegation to these seams
is a SEPARATE later wave (2b).

**The wave-2b delegation: web WRITES now go through the SDK.** The engine-adapter
mixins delegate their control-plane WRITES to the wave-2a seams (byte-identical
route/method/body/headers incl. `x-houston-org`, no post-write refetch — web
still owns its TanStack reads + `/v1/events` bus). Per module:

- **Agents** (`client/agents-mixin.ts`) — `createAgent`/`renameAgent`/`deleteAgent`
  delegate to `sdk.agents.writes.create/rename/delete`. The **color overlay stays
  adapter-side**: the SDK returns the wire agent (incl. its id), and `cp/agents.ts`
  `createdAgentToUi`/`renamedAgentToUi` layer web's overlay-only color on top
  (`setColor`/`moveColor`) then map to the UI `Agent`; delete calls `clearColor` +
  `dropLastAgentPref` after. `updateAgent` (color-only) + all reads stay. `cp`
  keeps `createAgent` for the portable-install flow (a `cfg`-scoped function with
  no SDK handle); it reuses `createdAgentToUi`.
- **Activities** (`client/activities-mixin.ts`) — `createActivity`/`deleteActivity`
  delegate to `sdk.activities.writes.create/delete` (local-echo kept adapter-side).
  `updateActivity` STAYS: it is a GENERIC `ActivityUpdate` PATCH (status +
  `pending_interaction`, title, …) that no single SDK write (`setStatus {status}`
  / `rename {title}`) reproduces byte-for-byte — delegating would drop fields.
- **Integrations** (`client/integrations-mixin.ts`) — `connectIntegration` →
  `sdk.integrations.connect(provider,toolkit,agent?)`; `disconnectIntegration` →
  `writes.disconnect(toolkit,{provider})`; `setIntegrationSession` →
  `setSession`; `dismissIntegrationsReconnectNotice` → `dismissReconnectNotice`.
  **The setSession 404-swallow is preserved adapter-side**: the SDK PROPAGATES a
  404 (a deployment with no gateway session sink — self-host / direct-key), so
  the mixin catches `EngineError` status 404 and returns (benign), rethrowing
  anything else. Reads stay.
- **Providers** — NOT delegated; kept adapter-side. The SDK provider writes route
  through `clientFor(agentId)` (the per-agent runtime client, a single-runtime
  credential model matching iOS/desktop-new-engine). Web-cloud instead uses the
  gateway's connect-once CENTRAL-credential routes (`/agents/:id/credential/*`,
  `/provider/openai-compatible`) with sibling fan-out (OpenCode Zen+Go),
  `claimActiveProvider`, a `ProviderLoginComplete` event, and the pre-agent
  setup-runtime path — none of which the SDK writes reproduce. Delegating would
  change routes and regress connect-once (e.g. `logout` without `forgetCredential`
  reconnects itself). Provider status also reads `listProviders` (→ `ProviderStatus`),
  not the SDK writes' `authStatus` (→ `AuthStatus`). The **login-poller state
  machine** (`provider-login-*.ts`, `activeLogins`/`loginWatchers`) likewise stays
  adapter-side.

Transient-retry parity holds for every delegated write: `cpFetch`'s
`transientRetryFetch` only blind-retries GET/HEAD, and the SDK requester never
retries — so POST/PATCH/PUT/DELETE surface the first response in both paths.
Errors still reach `errorMessage(err)` → toast; the SDK may throw `EngineError`
instead of `HoustonEngineError`, which is acceptable (it still surfaces, wave-2a
precedent). Guarded by `packages/web/tests/sdk-delegation-wave2b.test.ts`.

**The strict-additive / iOS-safe contract rule (why the above is shaped this
way).** `@houston/sdk` is consumed by BOTH the web engine-adapter AND the native
iOS app (via the JavaScriptCore bridge, `bridge/entry.ts` → `new HoustonSdk()`).
iOS reaches the SDK ONLY through the bridge — dispatched COMMANDS
(`registerCommand` types) and subscribed SCOPES — never facade methods directly.
So evolving the SDK for web MUST be strictly additive: never change an existing
method's signature/route/body or its post-write `refresh()` behavior, register no
new command for the web-only seams (the bridge can't route to what isn't
registered, so the new `writes`/session/notice surface is unreachable from iOS),
and keep every published scope snapshot shape unchanged. A web-needed op that
can't be added without altering iOS behavior is STOPPED and reported, not forced.

**The wave-3 shape (god-files → cohesive <200-line modules).** `client.ts` and
`control-plane.ts` were two god-files (2157 / 1505 lines) violating the repo's
200-line rule. They are now thin roots over cohesive modules; the public surface
is byte-identical (callers + the `vi.mock("…/control-plane")` test suite are
untouched), so this is a pure structural refactor.

- **`control-plane.ts` is now a barrel** that re-exports the `cp/*` modules
  (`fetch.ts` = the shared transport: `ControlPlaneConfig`, `cpFetch`,
  `gatewayAuthFetch`, `transientRetryFetch`, `liveToken`, `agentPath`;
  `runtime-clients.ts`, `agent-color.ts`, `agents.ts`, `credentials.ts`,
  `board.ts` activities+routines, `skills.ts`, `marketplace.ts`,
  `files-context.ts`, `events.ts`, `orgs.ts`, `spaces-billing.ts`,
  `agent-teams.ts`, `integrations.ts`) plus the shared type re-export block. It
  stays the ONE import site every caller and every test mock uses — the split is
  invisible. `cp/*` modules import `HoustonEngineError` from `client/errors.ts`
  (a leaf) to avoid an import cycle.
- **`HoustonClient` is composed from cluster mixins** (`client/*-mixin.ts`:
  boot, workspaces, agents, config-prefs, activities, agent-files, project-files,
  routines-skills, marketplace, chat-send, chat-history, provider-status,
  provider-login, provider-credentials, integrations, orgs, teams, portable,
  legacy-unsupported) over ONE **`AdapterContext`** (`client/context.ts`), held
  by `client/base.ts` as `protected this.ctx`. **The context is the single source
  of truth** for `engine`/`sdk`/`authFetch`/`activeLogins`/`loginWatchers` and
  the shared engine-routing helpers (`currentAgentId`, `requireAgentId`,
  `providerEngine`, `dropLastAgentPref`, `activeOld`, `prefConfig`). `cp` is a
  getter over a privately-held `ControlPlaneConfig`; `setActiveOrg` mutates THAT
  object in place, so `authFetch`, the per-agent runtime clients, and the SDK all
  reroute with no rebuild — no per-mixin copy of `cp`/active-org can drift
  (guarded by `tests/gateway-org-header.test.ts` + `active-org.test.ts`). Mixins
  call control-plane through the `import * as controlPlane from "../control-plane"`
  barrel (the mock seam) and reach state only via `this.ctx`. Cross-cluster
  helper bodies live as free functions taking the context
  (`client/activity-status.ts`, `client/provider-login-poll.ts`).
- **No silent-failure Proxy.** The old constructor ended with a catch-all
  `Proxy` whose `get` returned `async () => []` for any undefined method — it
  masked typos AND legacy methods as "empty result". It is gone. Legacy
  desktop/Rust-engine methods that don't exist on the host engine (worktrees,
  shell, phone tunnel/pairing, the Claude/Composio/Gemini CLIs) now throw an
  explicit error (`client/legacy-unsupported-mixin.ts`); any genuinely undefined
  method is `undefined` (a real TypeError on call), never a silent `[]`
  (`tests/legacy-unsupported.test.ts`).

---

## THE PROCEDURES

### a. Behavior change (turn lifecycle, state, reconnection, VM fields) → SDK first

Behavior is **never** written in surface code. Change it in the SDK, then bind.

1. **Locate the module** in `packages/sdk/src/modules/`: `session` (connection /
   token), `agents` (agent list), `conversations` (per-agent conversation LIST,
   scope `conversations/<agentId>`), `turns` (the live feed VM, scope
   `conversation/<id>`). Wire-level stream/reconnect changes may instead belong
   in `packages/runtime-client` (see the decision table, procedure f).
2. **Make the change once**, in the module or `runtime-client`. Keep the kernel
   pure JSON: no functions or class instances in a snapshot or command payload.
3. **Tests are mandatory and are part of the contract:**
   - **Unit** — the module's `*.test.ts` (e.g. `turns/turn-settle.test.ts`,
     `turns/vm-output.test.ts`).
   - **Wire contract** — if you touched the stream/resume surface, the web
     Playwright e2e runs the UI against `@houston/fake-host`, which is built from
     the same `@houston/runtime-client` pieces, so a wire mismatch fails there
     (`pnpm --filter houston-web test:e2e`).
   - **VM snapshot changes ARE contract changes.** A change to `ConversationVM`
     (`feed`, `running`, `sessionStatus`, `boardStatus`, `pendingInteraction`) or any published
     snapshot is a change to what every surface and the native bridge observes.
     Treat it exactly like a protocol change: **additive only** (procedure e /
     `BRIDGE.md` §4). Update the VM's own tests AND, if the shape changed, the
     `BRIDGE.md` feed-semantics section.
4. **Then surfaces bind.** Web/desktop consume the VM via the engine-adapter bus
   bridge today (or `@houston/sdk/react` hooks once wired). No surface
   re-derives the behavior.
5. **The web adapter seam:** if the behavior is in the turn/feed path, the
   adapter picks it up automatically — it *delegates* to the SDK
   (`engine-adapter/turn-stream.ts`). Only touch the adapter if you changed the
   `FeedOutput` interface itself.
6. **Mobile picks it up via the bridge.** iOS/Android never import TS UI; they
   embed the SDK in a JS engine and speak the `BRIDGE.md` JSON wire. A new VM
   field reaches them as an **additional optional field** on the pushed
   `snapshot` — no bridge version bump, no host change (`BRIDGE.md` §4). A
   breaking VM change (removed/renamed/retyped field) requires a bridge major
   `v` bump and is essentially never the right move — make it additive.

> **`sessionStatus` vs `boardStatus` — read the pair, not one.** A user Stop (and
> a logged-out provider) settles `sessionStatus === "error"` but
> `boardStatus === "needs_you"`. A surface keying off `sessionStatus` alone
> renders a normal Stop as a red failure. `boardStatus` is the handled-vs-error
> signal: `needs_you` = handled / your attention, `error` = genuine failure. A
> *clean* turn splits on whether it ended on an interaction: nothing outstanding →
> the terminal `done`; ended on `ask_user`/`request_connection` → `needs_you`
> carrying the `pendingInteraction` VM field (the question / connect card shown
> above the always-mounted composer). ONE exception: a lone `suggest_reusable`
> step (the save-as-Skill/Routine offer) settles `done`, not `needs_you` — the
> offer is optional, nothing is waiting on the user.
> (`packages/sdk/src/modules/turns/turn-settle.ts` / `vm-output.ts`; full
> lifecycle in `knowledge-base/architecture.md`.)

### b. Visual change → tokens procedure

A visual change is a **token edit**, never a literal. (Full detail:
`packages/design-tokens/README.md`; `knowledge-base/design-system.md`.)

1. Edit the JSON under `packages/design-tokens/tokens/` — a primitive value
   (`tokens/primitive/*.json`, the only place a literal hex/rgba lives) or a
   semantic reference (`tokens/semantic/color.{light,dark}.json`). **Never edit
   `dist/`. Never add a new hardcoded colour/spacing literal** to app or `ui/`
   CSS — reference a `--ht-*` var or a Tailwind `--color-*` utility.
2. `pnpm --filter @houston/design-tokens build` — regenerates all four `dist/`
   surfaces (CSS/TS/Swift/Kotlin) at once.
3. **Commit source + regenerated `dist/` together.** `test/sync.test.ts`
   rebuilds to a temp dir on every `pnpm test` and fails if the committed `dist/`
   is stale, so you can't forget.
4. If the change is intentionally *visual* (a real colour move), update
   `test/legacy-resolved.json` to the new baseline in the same commit — otherwise
   `test/zero-diff.test.ts` (correctly) fails.

### c. Structural / component change → inventory bump (same PR)

A component added, removed, or restructured (new part, new state, changed
semantics) is a structural change. (Full detail: `design/inventory/README.md`.)

1. Edit `design/inventory/inventory.yaml` — add or modify the component entry
   (only genuinely cross-surface components belong; see the README *Scope*).
2. **Bump `version`.**
3. **Add a matching `## vN` entry to `design/inventory/CHANGELOG.md`** (a bump
   without a changelog entry is a hard `check:parity` fail).
4. **Update every *enforced* surface manifest in the SAME PR** — `web.yaml` is
   enforced (`enforced: true`); it may not leave a component with
   `since <= inventoryVersion` `not-started`. Use `partial` + a `notes` if it
   only half-lands.
5. **Unenforced surfaces (iOS/Android) catch up later.** As a native app
   implements a component, flip its status and raise that manifest's
   `inventoryVersion`. `check:parity` prints their lag but never fails on them.
6. **Flip `enforced: true`** for a surface only when its app *ships* at that
   inventory version.
7. `pnpm check:parity` must pass.

### d. New cross-surface feature

1. **Capabilities gate.** If the feature is conditional (profile/plan/platform),
   gate it on `/v1/capabilities` (`convergence/README.md` — capabilities
   replace "am I web/desktop" branches), not a surface fork.
2. **Inventory entry.** Any new user-facing component → procedure c.
3. **SDK module / commands.** New behavior → a module command + snapshot in
   `packages/sdk` → procedure a. Reads are snapshots keyed by scope; writes are
   commands in the registry (duplicate command `type` throws — a wiring bug).
4. **Per-surface UI.** Each surface binds the view-model to native UI, native in
   form. Same model, native presentation.
5. **Deliberately single-surface feature** (desktop-only chrome — menu bars,
   split panes, file tree, cron editor): **do NOT inventory it** (inventory
   *Scope* excludes desktop-only surfaces). Build it in `app/` (or the relevant
   surface) and gate it on the capability/platform so other surfaces cleanly
   omit it. Single-surface is fine when it's *intended*; the inventory exists to
   catch the *accidental* skip.

### e. Wire / protocol change

1. **Protocol v3 is additive.** Consumers ignore unknown fields; producers add
   only optional fields; discriminated unions only gain members
   (`convergence/README.md`; `BRIDGE.md` §4). Never change a field's type or
   meaning.
2. **Contract docs live in code:** wire types + zod in
   `packages/protocol/src/wire.ts`; the provider-error taxonomy in
   `packages/protocol/src/provider-error.ts`; the resumable-stream contract
   (`seq`, `turnId`, resume cursor, `resync`) in `wire.ts` and implemented in
   `packages/runtime-client` (`replay.ts` / `stream-channel.ts` / `stitch.ts`).
   The native-bridge projection of all of it is `packages/sdk/BRIDGE.md` — update
   it in the same PR when the wire shape a host observes changes.
3. **Cross-repo obligation.** If you change the gateway↔engine surface (routes,
   auth, engine-pod env contract), update the sibling `cloud` repo's
   `INTEGRATION.md` in the same task (workspace `CLAUDE.md` → *Cross-repo
   changes*). The wire contract cloud consumes IS Houston's protocol v3.

### f. Where NEW client code goes (decision table)

| Put it in… | When |
| --- | --- |
| **`packages/sdk`** | Client *behavior*: turn lifecycle, state folding, reconnection semantics, a view-model, a command. Anything a native surface must observe identically. Headless, JSON-only. |
| **`packages/runtime-client`** | The *wire*: HTTP/SSE transport, resumable-stream sequencing/replay, snapshot reduction, the global-events loop. Below the SDK; shared by SDK + adapter + host + fake-host. |
| **`ui/` (`@houston-ai/*`)** | A *generic, reusable* React component. **Props only — no store/Zustand/Tauri imports, no `app/` types (use generic `BoardItem`/`FeedItem`/`ChatMessage`), no `@/` aliases, i18n-agnostic (`labels?` props with English defaults).** (`CLAUDE.md` → Library boundary.) |
| **`app/` (= `packages/web`)** | *App-specific* composition: wiring `ui/` components to SDK view-models, i18n `t()` injection, routing, desktop chrome. Unsure whether it's generic? Start in `app/`, extract to `ui/` later. |
| **`packages/web/src/engine-adapter`** | Only the `@houston-ai/engine-client` compatibility shim and control-plane surface not yet migrated to the SDK. **Prefer the SDK** — the adapter is shrinking, not growing (procedure a; `convergence/README.md` P6). |

---

## Verification matrix

Real script names (from each `package.json`). Run what you touched; run
`pnpm check` always.

| Area | Command |
| --- | --- |
| Biome (all TS/JS/JSON/md) | `pnpm check` (write: `pnpm check:fix`) |
| SDK unit + VM/contract | `pnpm --filter @houston/sdk test` |
| SDK types | `pnpm --filter @houston/sdk typecheck` |
| Runtime-client | `pnpm --filter @houston/runtime-client test` · `… typecheck` |
| Web unit | `pnpm --filter houston-web test` |
| Web types (incl. Tauri shim-parity guard) | `pnpm --filter houston-web typecheck` |
| Web e2e (Playwright vs fake-host = the wire contract) | `pnpm --filter houston-web test:e2e` |
| Fake host types | `pnpm --filter @houston/fake-host typecheck` |
| Tokens build (regenerate `dist/`) | `pnpm --filter @houston/design-tokens build` |
| Tokens sync + zero-diff | `pnpm --filter @houston/design-tokens test` |
| Component parity | `pnpm check:parity` |
| Open/closed boundaries | `pnpm check:boundaries` |
| Whole workspace | `pnpm typecheck` · `pnpm test` |

---

## Known deferred items (honest, from merged reality)

- **Engine-adapter migration is unfinished.** Turns/feed + the global-events
  loop are migrated into the SDK; control-plane CRUD, auth/token mirroring, and
  `synthetic.ts` provider id-remapping still live adapter-side. The adapter is
  deleted at the gated final cutover (`convergence/final-cutover.md`), not before.
- **React hooks await their first consumer.** `@houston/sdk/react`
  (`useSdkSnapshot`, `useSdkEvent`) ship and are tested, but nothing in
  `packages/web`/`app` consumes them yet — the web app still threads its client
  explicitly (`packages/web/src/new-engine/app.tsx`). No `SdkProvider`/`useSdk()`
  context by design; add one only when a real consumer needs it.
- **The native bridge is built.** `BRIDGE.md` fixes the wire; the JS-side
  dispatcher and its self-contained JavaScriptCore bundle
  (`packages/sdk/src/bridge/`, built to `packages/sdk/dist/houston-sdk.bridge.js`
  via `pnpm --filter @houston/sdk build:bridge`) exposing global
  `HoustonSdkBridge.create({ send })` now exist, with a bundle smoke test.
- **iOS has a built v1** at `mobile/ios/` (SwiftUI, iOS 17+, zero third-party
  packages) — a thin surface over `@houston/sdk` running in JavaScriptCore, with
  UI/copy/status parity governed by `mobile/PARITY.md`. Its manifest is still
  `enforced: false`, `inventoryVersion: 0` (built but not yet compiled+shipped —
  see `design/inventory/manifests/ios.yaml` for honest per-component statuses).
  Android remains all `not-started`. `check:parity` reports each surface's lag
  but never fails on them. The Swift token `dist/` output is consumed by the iOS
  app (synced into `mobile/ios/Houston/Generated/` at build time); Kotlin has no
  consumer yet.
- **Four web inventory `partial`s** (real structural gaps, extract-before-mobile):
  - `provider-error-card` — feed types + `ProviderError` taxonomy are shared, but
    the rendered cards are app/-locked (`app/src/components/shell/provider-error-cards/*`).
  - `mission-status-chip` — status rendering is triplicated across kanban-card,
    conversation-list, and review-item with divergent `RunStatus` enums; no
    shared chip yet.
  - `agent-list-item` — no single shared component; the row is composed in `app/`
    from generic nav + avatar primitives; aggregate status is app-side.
  - `skill-invocation-message` — the marker decode is shared, but the card render
    is composed in `app/`.
- **`sessionStatus`-vs-`boardStatus` nuance** (see procedure a) — a persistent
  trap: a Stop / logged-out provider is `sessionStatus: "error"` but
  `boardStatus: "needs_you"`. Always read the pair; never render red off
  `sessionStatus` alone. A clean turn is the terminal `done` unless it ended on
  `ask_user`/`request_connection`, which settles `needs_you` + a
  `pendingInteraction` the composer renders as a card.

---

*Related: `packages/sdk/README.md` (the model in depth) · `packages/sdk/BRIDGE.md`
(native wire) · `packages/design-tokens/README.md` (tokens) ·
`design/inventory/README.md` (parity) · `knowledge-base/design-system.md`
(shipped visual language) · `convergence/README.md` (the one-engine program,
resumable streams).*
