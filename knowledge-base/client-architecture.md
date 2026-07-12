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
| **SDK** | `packages/sdk` | `packages/sdk/README.md` | Headless client. **kernel** (`store.ts` scopes/snapshots, `commands.ts` registry, `ports.ts` injected capabilities, `sdk.ts` composition); **modules** (`session`, `agents`, `activities`, `providers`, `integrations`, `preferences`, `conversations`, `turns`); **`react/`** subpath (`@houston/sdk/react` — `useSdkSnapshot`); **`bridge/`** the shipped native-bridge dispatcher (`createBridge`) + embeddable IIFE bundle (`build:bridge` → `dist/houston-sdk.bridge.js`, gitignored) that backs `fetch`/`storage` natively over the pipe and self-shims JSC globals; **`BRIDGE.md`** its wire spec (§2.1 configure, §9 native ports, §10 host polyfills). |
| **Design tokens** | `packages/design-tokens` | `packages/design-tokens/README.md` | Two-tier DTCG JSON (`tokens/primitive` + `tokens/semantic` + `tokens/scale`) → Style Dictionary → committed `dist/` (`css/tokens.css`, `ts/tokens.ts`, `swift/HoustonTokens.swift`, `kotlin/HoustonTokens.kt`). |
| **Component inventory** | `design/inventory` | `design/inventory/README.md` | `inventory.yaml` (versioned cross-surface component spec) + `manifests/{web,ios,android}.yaml` (per-surface status) + `CHANGELOG.md`. Enforced by `scripts/check-parity.mjs` (`pnpm check:parity`). |
| **Fake host** | `packages/fake-host` | `packages/fake-host/README.md` | In-memory protocol-v3 host for UI/e2e tests. Built from the SAME `@houston/runtime-client` stream pieces as the real host, so it can't drift from the wire. Consumed by `packages/web` Playwright e2e. |
| **Runtime client** | `packages/runtime-client` | (source) | The **wire layer**: `HoustonEngineClient`, resumable streams (`resume.ts`, `replay.ts` `ReplayLog` ring buffer, `stream-channel.ts`, `stitch.ts`), snapshot reduction (`snapshot.ts`), and the workspace-global reactivity loop (`global-events.ts`). Shared by the SDK, the web adapter, the host, and the fake host. |
| **Web engine-adapter** | `packages/web/src/engine-adapter` | (source headers) | The web↔SDK seam — see below. |

### The engine-adapter (web) — how it works now

`packages/web/src/engine-adapter/` is the drop-in replacement for
`@houston-ai/engine-client` (aliased in `vite.config.ts` in host/new-engine
mode), letting the whole desktop UI run on the host unchanged. Convergence's
end-state is that it dissolves into direct SDK consumption
(`convergence/README.md` P6 / `final-cutover.md`); today it is a thin seam that
**delegates client behavior to `@houston/sdk` and keeps only web-specific glue**.

- **One `HoustonSdk`, write-delegation, web owns reads.** `HoustonClient`
  constructs the single web-side `HoustonSdk` in `sdk-client.ts` (`createEngineSdk`,
  reachable via the `engineSdk` getter). Its `ports.fetch` is the SAME
  `gatewayAuthFetch` the raw `engine` uses, so bearer / 401-refresh / `x-houston-org`
  (off the live `ControlPlaneConfig.activeOrgSlug`, mutated in place by
  `setActiveOrg`) are one source of truth. The SDK is built `reactivity: false`
  (`SdkConfig`, `ports.ts`): its modules open NO `/v1/events` streams, because
  **web owns reads via TanStack Query + the `/v1/events` bus** and only delegates
  WRITES. Do not adopt the SDK's scope snapshots as the web read model.
- **Turn/feed + reactivity already run on the SDK.** `turn-stream.ts` delegates
  to the SDK's `streamTurn`/`observeConversation`; `feed-output.ts` implements the
  SDK's `FeedOutput`; both the SDK and adapter consume the ONE `streamGlobalEvents`
  in `runtime-client`. The conversation VM cache is bounded — `ConversationVmOutput`
  keeps folded transcripts in an `LruCache` (default `conversationCacheMax` 50);
  idle conversations evict and re-hydrate from history, live/subscribed ones are
  pinned, `turns.forget(id)` drops one explicitly.
- **CRUD writes delegate to the SDK modules** (byte-identical route/method/body,
  no post-write refetch): `agents.writes.*`, `activities.writes.create/delete`,
  and integrations `connect`/`writes.disconnect`/`setSession`/`dismissReconnectNotice`.
  Web-only glue stays adapter-side: the agent **color overlay** (SDK returns the
  wire id, `cp/agents.ts` layers overlay-only colour), local-echo, and the
  integrations **setSession 404-swallow** (the SDK propagates 404; a no-session-sink
  deployment treats it as benign).
- **Deliberately NOT delegated** (genuine model differences, not duplication):
  **providers** — web-cloud uses the gateway's connect-once CENTRAL-credential
  routes (`/agents/:id/credential/*`, sibling fan-out, `claimActiveProvider`,
  `ProviderLoginComplete`, the setup-runtime path); the SDK's provider writes use
  the per-agent single-runtime credential model, so delegating would change routes
  and regress connect-once. The **login-poller** (`provider-login-*.ts`) stays too.
  **`updateActivity`** — a generic `ActivityUpdate` PATCH no narrow SDK write
  reproduces field-for-field.
- **Structure (no god-files, no silent failures).** `HoustonClient` is composed
  from cluster mixins (`client/*-mixin.ts`) over ONE `AdapterContext`
  (`client/context.ts`, held by `client/base.ts` as `this.ctx` — the single source
  of truth for `engine`/`sdk`/`authFetch`/`activeLogins`/routing helpers).
  `control-plane.ts` is a barrel re-exporting `cp/*` modules (`fetch.ts` is the
  shared transport: `cpFetch`, `gatewayAuthFetch`, `transientRetryFetch`) — the ONE
  import site callers and `vi.mock` use. Every file is ≤200 lines. Unsupported
  legacy desktop/Rust methods throw explicitly (`client/legacy-unsupported-mixin.ts`);
  there is no catch-all Proxy returning silent `[]`.

**Hosted, capability-gated surfaces (worked example: C9 personal API keys).** A
gateway-only feature adds ONE method across the four fetch layers in signature
lockstep — miss one and the web typecheck fails: `ui/engine-client`
(`client.ts` `request()` + a wire type in `types.ts`), the web adapter
(`cp/<feature>.ts` `cpFetch` fns re-exported by `control-plane.ts` + a
`client/<feature>-mixin.ts` with the `if (!this.ctx.cp)` off-cloud throw, composed
in `client.ts`), and the app facade (`lib/tauri.ts` `call()` wrapper). Feature-
detect with an optional `Capabilities` flag (C9 = `apiKeys?: boolean`), absent on
desktop/self-host/older gateways — `capabilities()` returns the raw `/v1/capabilities`
JSON, so a new optional flag needs NO adapter mapping. Gate the whole UI on it
(the settings row + the query's `enabled`), keep pure logic (gate/validation/error
classifier) in a `lib/*-model.ts` unit-tested under bare Node, and route an
EXPECTED business 400 (e.g. `key_limit`, read off the gateway's flat top-level
`body.code`) through `call()`'s `silence` predicate so it renders inline instead
of the red bug toast. Files: `app/src/{lib/api-keys-model,hooks/queries/use-api-keys}.ts`
+ `components/settings/sections/api-keys*.tsx`.

**Strict-additive / iOS-safe rule.** `@houston/sdk` is consumed by BOTH web AND
the native iOS app (via the JavaScriptCore bridge, `bridge/entry.ts`). iOS reaches
the SDK ONLY through dispatched bridge COMMANDS and subscribed SCOPES — never
facade methods. So evolving the SDK for web MUST be strictly additive: never
change an existing method's signature/route/body or its `refresh()` behavior,
register no new command for web-only seams (unregistered = unreachable from iOS),
and keep every published snapshot shape unchanged. A web-needed op that can't be
added without altering iOS behavior is STOPPED and reported, not forced.

---

## THE PROCEDURES

### a. Behavior change (turn lifecycle, state, reconnection, VM fields) → SDK first

Behavior is **never** written in surface code. Change it in the SDK, then bind.

1. **Locate the module** in `packages/sdk/src/modules/`: `session` (connection /
   token), `agents`, `activities`, `providers`, `integrations`, `preferences`,
   `conversations` (per-agent conversation LIST, scope `conversations/<agentId>`),
   `turns` (the live feed VM, scope `conversation/<id>`). Wire-level
   stream/reconnect changes may instead belong in `packages/runtime-client` (see
   the decision table, procedure f).
2. **Make the change once**, in the module or `runtime-client`. Keep the kernel
   pure JSON: no functions or class instances in a snapshot or command payload.
   A write that a `reactivity:false` host must call without a refetch belongs on
   the module's `writes.*` namespace (returns the wire entity, no `refresh()`).
3. **Tests are mandatory and are part of the contract:**
   - **Unit** — the module's `*.test.ts` (e.g. `turns/turn-settle.test.ts`,
     `turns/vm-output.test.ts`).
   - **Wire contract** — if you touched the stream/resume surface, the web
     Playwright e2e runs the UI against `@houston/fake-host`, built from the same
     `@houston/runtime-client` pieces, so a wire mismatch fails there.
   - **VM snapshot changes ARE contract changes.** A change to `ConversationVM`
     (`feed`, `running`, `sessionStatus`, `boardStatus`, `pendingInteraction`) or
     any published snapshot is what every surface and the native bridge observes.
     Treat it like a protocol change: **additive only** (procedure e / `BRIDGE.md`
     §4). Update the VM's tests AND, if the shape changed, `BRIDGE.md`.
4. **Then surfaces bind.** Web/desktop consume the VM via the engine-adapter
   (delegating to `turn-stream.ts`) or `@houston/sdk/react` hooks. No surface
   re-derives the behavior. Only touch the adapter if you changed `FeedOutput`.
5. **Mobile picks it up via the bridge.** iOS/Android embed the SDK in a JS engine
   and speak the `BRIDGE.md` JSON wire. A new VM field reaches them as an
   additional optional field on the pushed `snapshot` — no bridge bump. A breaking
   VM change (removed/renamed/retyped field) needs a bridge major `v` bump and is
   essentially never right — make it additive.

> **`sessionStatus` vs `boardStatus` — read the pair, not one.** A user Stop (and
> a logged-out provider) settles `sessionStatus === "error"` but
> `boardStatus === "needs_you"`. A surface keying off `sessionStatus` alone
> renders a normal Stop as a red failure. `boardStatus` is the handled-vs-error
> signal: `needs_you` = handled / your attention, `error` = genuine failure. A
> *clean* turn splits on whether it ended on an interaction: nothing outstanding →
> the terminal `done`; ended on `ask_user`/`request_connection` → `needs_you`
> carrying the `pendingInteraction` VM field. ONE exception: a lone
> `suggest_reusable` step (save-as-Skill/Routine offer) settles `done`, not
> `needs_you` — nothing is waiting on the user. A user Stop (or dismissing an
> interaction card, which is a user interruption) now persists a durable
> `stopped: true` marker on the assistant `ChatMessage`, so settle-FROM-HISTORY
> routes it through the SAME `finishErr` stop settle → `needs_you` (live and
> reload agree; a stopped turn re-derives neither a false `done` nor a
> `pendingInteraction` card) — fixing the pre-marker divergence.
> (`packages/sdk/src/modules/turns/turn-settle.ts` / `vm-output.ts` /
> `settle-from-history.ts`.)

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
3. **Commit source + regenerated `dist/` together.** `test/sync.test.ts` rebuilds
   on every `pnpm test` and fails if the committed `dist/` is stale.
4. If the change is intentionally *visual* (a real colour move), update
   `test/legacy-resolved.json` to the new baseline in the same commit — otherwise
   `test/zero-diff.test.ts` (correctly) fails.

### c. Structural / component change → inventory bump (same PR)

A component added, removed, or restructured is a structural change. (Full detail:
`design/inventory/README.md`.)

1. Edit `design/inventory/inventory.yaml` — add/modify the entry (only genuinely
   cross-surface components belong; see the README *Scope*).
2. **Bump `version`.**
3. **Add a matching `## vN` entry to `design/inventory/CHANGELOG.md`** (a bump
   without a changelog entry is a hard `check:parity` fail).
4. **Update every *enforced* surface manifest in the SAME PR** — `web.yaml` is
   enforced; it may not leave a component with `since <= inventoryVersion`
   `not-started`. Use `partial` + a `notes` if it only half-lands.
5. **Unenforced surfaces (iOS/Android) catch up later.** Flip status + raise that
   manifest's `inventoryVersion` as a native app implements a component.
   `check:parity` prints their lag but never fails on them.
6. **Flip `enforced: true`** for a surface only when its app *ships* at that
   inventory version.
7. `pnpm check:parity` must pass.

### d. New cross-surface feature

1. **Capabilities gate.** Conditional feature (profile/plan/platform) → gate on
   `/v1/capabilities`, not a surface fork.
2. **Inventory entry.** Any new user-facing component → procedure c.
3. **SDK module / commands.** New behavior → a module command + snapshot in
   `packages/sdk` → procedure a. Reads are snapshots keyed by scope; writes are
   commands (duplicate command `type` throws — a wiring bug).
4. **Per-surface UI.** Each surface binds the view-model to native UI. Same model,
   native presentation.
5. **Deliberately single-surface feature** (desktop-only chrome — menu bars, split
   panes, file tree, cron editor): **do NOT inventory it**; build it in `app/` and
   gate on the capability/platform. Single-surface is fine when *intended*; the
   inventory exists to catch the *accidental* skip.

### e. Wire / protocol change

1. **Protocol v3 is additive.** Consumers ignore unknown fields; producers add
   only optional fields; unions only gain members. Never change a field's type or
   meaning.
2. **Contract docs live in code:** wire types + zod in `packages/protocol/src/wire.ts`;
   provider-error taxonomy in `provider-error.ts`; the resumable-stream contract
   (`seq`, `turnId`, resume cursor, `resync`) in `wire.ts`, implemented in
   `runtime-client`. The native-bridge projection is `packages/sdk/BRIDGE.md` —
   update it in the same PR when the observed wire shape changes.
3. **Cross-repo obligation.** If you change the gateway↔engine surface (routes,
   auth, engine-pod env), update the sibling `cloud` repo's `INTEGRATION.md` in the
   same task. The wire contract cloud consumes IS Houston's protocol v3.

### f. Where NEW client code goes (decision table)

| Put it in… | When |
| --- | --- |
| **`packages/sdk`** | Client *behavior*: turn lifecycle, state folding, reconnection, a view-model, a command. Anything a native surface must observe identically. Headless, JSON-only. |
| **`packages/runtime-client`** | The *wire*: HTTP/SSE transport, resumable-stream sequencing/replay, snapshot reduction, the global-events loop. Below the SDK; shared by SDK + adapter + host + fake-host. |
| **`ui/` (`@houston-ai/*`)** | A *generic, reusable* React component. **Props only — no store/Zustand/Tauri imports, no `app/` types, no `@/` aliases, i18n-agnostic (`labels?` props).** |
| **`app/` (= `packages/web`)** | *App-specific* composition: wiring `ui/` to SDK view-models, `t()` injection, routing, desktop chrome. Unsure if generic? Start in `app/`, extract later. |
| **`packages/web/src/engine-adapter`** | Only web↔SDK glue and the not-yet-delegated surface (providers, `updateActivity`). **Prefer the SDK** — the adapter is shrinking, not growing. |

---

## Verification matrix

Run what you touched; run `pnpm check` always.

| Area | Command |
| --- | --- |
| Biome (all TS/JS/JSON/md) | `pnpm check` (write: `pnpm check:fix`) |
| SDK unit + VM/contract | `pnpm --filter @houston/sdk test` · `… typecheck` |
| Runtime-client | `pnpm --filter @houston/runtime-client test` · `… typecheck` |
| Web unit | `pnpm --filter houston-web test` |
| Web types (incl. Tauri shim-parity guard) | `pnpm --filter houston-web typecheck` |
| Web e2e (Playwright vs fake-host = the wire contract) | `pnpm --filter houston-web test:e2e` |
| Tokens build + sync/zero-diff | `pnpm --filter @houston/design-tokens build` · `… test` |
| Component parity | `pnpm check:parity` |
| Open/closed boundaries | `pnpm check:boundaries` |
| Whole workspace | `pnpm typecheck` · `pnpm test` |

---

## Known deferred items (honest, from merged reality)

- **The adapter still exists.** Turn/feed, reactivity, and agents/activities/
  integrations/preferences+grants WRITES run through the SDK; providers (central-
  credential model), the login-poller, and `updateActivity` stay adapter-side by
  design (see above). The adapter is deleted at the gated final cutover
  (`convergence/final-cutover.md`), not before.
- **Unifying the two provider credential models** (web-cloud central-credential vs
  the SDK's per-agent runtime credential) is the remaining prerequisite to
  delegating providers — a deliberate design effort, not duplication removal.
- **iOS has a built v1** at `mobile/ios/` (SwiftUI, iOS 17+, thin surface over
  `@houston/sdk` in JavaScriptCore, parity governed by `mobile/PARITY.md`).
  Manifest is `enforced: false`, `inventoryVersion: 0` (built, not yet shipped).
  Android is all `not-started`. `check:parity` reports lag, never fails on them.
- **Four web inventory `partial`s** (extract-before-mobile): `provider-error-card`
  (cards app/-locked), `mission-status-chip` (status render triplicated, divergent
  `RunStatus` enums), `agent-list-item` (composed in `app/`, no shared component),
  `skill-invocation-message` (decode shared, card composed in `app/`).

---

*Related: `packages/sdk/README.md` (the model in depth) · `packages/sdk/BRIDGE.md`
(native wire) · `packages/design-tokens/README.md` (tokens) ·
`design/inventory/README.md` (parity) · `knowledge-base/design-system.md`
(shipped visual language) · `convergence/README.md` (the one-engine program).*
