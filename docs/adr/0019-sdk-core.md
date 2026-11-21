# The SDK kernel: one client, snapshots in, commands out

`@houston/sdk` (`packages/sdk/src`) is the one client implementation under desktop, web and the AI Manager. This ADR covers the kernel and the shared pieces every module relies on. Module families have their own ADRs.

## Reads are whole snapshots, writes are commands

`ScopeStore` (`store.ts`) holds the latest snapshot per string scope (`connection`, `agents`, `conversation/<id>`). A module publishes the whole new value on every change; there is no patch protocol, because Houston's event rates are UI-scale and "latest wins" beats patch bookkeeping. Everything crossing `getSnapshot`, `subscribe`, `dispatch` and `on` is plain JSON, so it can cross a structured-clone boundary unchanged.

- `publish` and `emitEvent` iterate a copy of the listener set, so a listener may subscribe or unsubscribe mid-notification.
- A throwing listener never reaches the publisher or its siblings. The snapshot is already stored, every other listener runs, and the error is rethrown on its own microtask (`rethrowAsync`) so it lands on the uncaught-error path and gets reported. A UI binding's failure must never abort the turn machinery mid-frame.

Writes go through `CommandRegistry` (`commands.ts`). A typed facade method is the in-process path and `HoustonSdk.dispatch` takes the same call as a JSON envelope; both reach one registered handler, so no write exists twice. `register` throws on a duplicate type, because two modules claiming one command is a wiring bug. `dispatch` never throws: a malformed envelope, an unknown type or a failing handler resolves to `ok: false`, and `envelopeId` still recovers the caller's id from a malformed envelope so the answer reaches whoever waits on it. `toCommandError` keeps a numeric `status`.

Payload readers in `modules/payload.ts` throw rather than default, so a refusal reads the same everywhere and a coerced default never acts on a field the caller did not send. `requireBoolean` exists because coercing a missing flag to `false` would act on the off side of a switch as if asked.

## Kernel composition order

`HoustonSdk` (`sdk.ts`) owns one store, one per-agent engine-client cache, one `AuthExpiryNotifier` and one registry, and composes every `create<Name>Module` once. Modules are internal; a host builds `new HoustonSdk(...)`.

- Session is composed first, so the shared notifier and `session/setToken` exist before the agents event stream can produce a 401. That order alone does not stop a startup 401 from looking like an expiry, because hydration reads the token asynchronously. The real guard is that the notifier ignores tokenless 401s.
- Activities is composed before turns: the turns module's default board-status output persists a card by session key through activities. It is injected as one bound function, so turns depends on one method and never the reverse.
- Citations come after files, because a send's crops ride the composer attachments route.
- In the constructor, `sdk.<property> = create<Name>Module(ctx)` names each namespace for the generated assistant catalog (`scripts/assistant-catalog/assistant-facade-surface.ts`). Facade types in `sdk-modules.ts` are always `ReturnType<typeof create<Name>Module>`, never hand-written, so they cannot drift from their factory.
- `dispose` stops the agents and activities streams and every in-flight turn and observer stream. The instance is single-use afterwards.

## Ports

The kernel never touches a global (`fetch`, `localStorage`, `Date.now`, `console`) and imports nothing from `node:*`. Every side effect arrives through `SdkPorts` (`ports.ts`), so the same kernel runs in a browser, a desktop webview, an SSR worker or a test.

- `storage` holds the SDK's own state (the session token), namespaced by the host, and may degrade to memory.
- `devicePreferences` is separate on purpose. Its key names are the app's, because the app's pre-paint path reads them too. A failure rejects rather than degrading to memory, because a device preference is a person's action and a write that resolved having stored nothing would look saved and be gone on next launch. Device state only; anything that follows the person belongs on the gateway.
- `monotonic` is for spans a wall clock change would misstate. It may stop during sleep, so a span that must end on time reads both clocks.
- `PageLifecycle` lets the SDK tell "the host never answered because the page left" from "the host never answered". A browser aborts in-flight requests on unload and they look like a dead network. The SDK holds such a write and resends it if the page turns out to be live (`turns.importMessages`). A host with no page omits the port.
- `rawFetch` is the unauthenticated transport for upload sinks and is never decorated with auth or retries.
- `fanOut` is a shared gate, because a host that rebuilds its SDK on every bearer rotation and per space must keep the bound across rebuilds (see below).
- `reactivity: false` gives a write-only SDK for a host with its own read model (the web adapter keeps TanStack Query and its own `/v1/events` bus). No module opens a stream, and those scopes stay empty.
- `conversationCacheMax` bounds folded transcripts kept in memory (default `DEFAULT_CONVERSATION_CACHE_MAX`, 50).

## The REST seam

`modules/http.ts` is the one HTTP seam for every route the runtime client cannot reach. The runtime client is rooted at one agent's sandbox, so anything account-, space- or agent-list-shaped goes here.

- Call sites pass a relative path built from string literals and `encodeURIComponent(<parameter>)`. The base lives in the scope, never in the template. The assistant catalog is derived statically from those literals, so a path assembled from a runtime value silently drops the operation from what the AI Manager can do. `check:sdk-parity` reads the same literals.
- `moduleScope` binds `fail` to the module's own error class, so a caller catches one class per family. A non-2xx always throws; a surface that cannot tell "nothing there" from "could not ask" shows the person something untrue.
- Each `SdkHttpError` subclass passes its `name` as a string literal, because the production bundle mangles class names and surfaces branch on `err.name`.
- A write refused with a typed nothing-ran refusal (`compute_busy`, `pod_wake_refused`) is resent as the same request within `COMPUTE_RETRY_BUDGET_MS` (20 s), default pause 2 s. The gateway sends those codes only when nothing ran, so a resend never applies a write twice. Only a request with a replayable body can resend; a stream body is spent by the first try. GET and HEAD keep the one waking ladder the host's transport already rides (the web adapter's `transientRetryFetch`), so a second ladder never stacks on it. `retryComputeRefusals` (`modules/compute-retry.ts`) gives runtime-client calls the same budget, because that client throws its own `EngineError`.
- `utf8LengthExceeds` measures a string's UTF-8 length without encoding it, so a 100 MB body is not copied to be measured.

`engine-clients.ts` memoizes one runtime client per agent id, rooted at `/agents/<id>`. The empty id roots at the base URL, the single-runtime local profile where routes are flat.

## One 401 signal per token

`AuthExpiryNotifier` (`auth-expiry.ts`) emits `session/tokenExpired` exactly once per token value. Without that, the agents event loop retrying on a stale token would push the host into a refresh loop, while a 401 on a newly set token must still fire.

The dedupe keys on the token the failing request carried, not the one current when the 401 lands. The host refreshes proactively, so `setToken(B)` can run while requests stamped with A are in flight; blaming A's late 401 on B would refresh a good token. So a 401 is suppressed when its token is no longer current, when the request went out tokenless, and when the caller supplies no token at all. The auth-fetch is the authoritative reporter (see the sign-in and session ADR). `isUnauthorized` duck-types `{ status: 401 }` so an error that crossed `dispatch` and lost its prototype still classifies.

## Replays under another person's bearer

The hosted transport answers a 401 by refreshing and replaying with whatever bearer is current (`packages/engine-adapter` `cp/bearer-recovery.ts`). For a request that acts in the person's name elsewhere, such as a LinkedIn post, the current bearer may belong to someone who signed in since. `withoutAuthReplay` (`auth-replay.ts`, published as `@houston/sdk/auth-replay`) marks such a request with a symbol key on the `RequestInit`, which object spreads copy and `fetch` ignores, so it never reaches the wire. A marked request is replayed only when the refreshed bearer names the same person and is never sent without a bearer. `assertRequestIdentity` re-checks the initiating identity before each transport retry.

## Shared classifiers

- `isTransportFailure` (`transport-failure.ts`) is the one predicate for a failed connection, matched by the fixed message set each engine uses (`TRANSPORT_MESSAGE`: WebKit's "Load failed" and CFNetwork phrasings, Chromium's "Failed to fetch" and "network error", Firefox's "NetworkError when attempting to fetch resource.", undici's "fetch failed"). A coding-bug `TypeError` does not match. A match does not prove the server never acted, so it never justifies replaying a non-idempotent request. The adapter's offline classifier and the SDK's interrupted-upload typing both use it.
- `isWakingAnswer` (`modules/waking-answer.ts`) keys on exact (status, reason) pairs for "the pod is not there right now": waking, restarting, runtime still booting, an id latched during a rename, and a host draining. Never a bare 502 or 503, because a provider quota page can use the same status. The adapter's `isEngineWakingError` reads the same pairs.
- `refusalCode` (`modules/refusal-code.ts`) reads a refusal's `code` from the adapter's parsed `body` or the SDK error's message text, so a state is recognized the same way whichever stack threw.
- `NoAgentForProviderWriteError` (`no-agent-provider-write-error.ts`): a custom OpenAI-compatible endpoint is per-runtime state, not a credential, and the hidden setup runtime is torn down when the first real agent is created. Saving it there would report success and lose it. So in a settled, empty agent list the write is refused as an expected state with copy telling the person to create an agent first.

## Quiet error classes

`QuietErrorClass` (`quiet-error-class.ts`) is the vocabulary for expected environment states: offline, a pod waking, a bridge state, and named business states. The person sees one informational notice, never a bug report, and the diagnostic reaches Sentry as a warning under a fixed fingerprint per class, so each class is one issue with a count and a deploy can never file new ones. The value is the fingerprint. The classifiers that name a class read transport and gateway shapes, so they live in the adapter and the app; this file holds only the vocabulary and the collapse rule.

Some classes are skipped by every reporting path because they are pure business states with their own copy (`plan_min_interval`, `webhook_not_creator`, `first_day_no_provider`). Others still report one counted warning because a burst means something on our side: `routine_gone` (a stale mirror), `bug_intake_unavailable`, `link_identity_taken` (support can join the accounts), `codex_port_taken`. `upload_interrupted` has its own class so a proxy cutting slow uploads is never hidden among network drops.

`quietBurstKey` keys `offline` on the class alone: a transport drop fails every live query at once with the same message, and keying per command filed a dozen events per sleep-wake. Every other class keys on class, command and agent, because a waking answer is per agent and feeds the stuck-wake tracker.

## Roster-wide reads are bounded

The cross-agent missions sweep reads every agent's board on each load. Unbounded, a 105-agent space sent 105 requests at once, each resolving the caller's memberships, and a reload cancelled them all together. The gate in `fan-out.ts` starts at most `AGENT_FAN_OUT_LIMIT` (8) reads per slot turnover. A read the gateway holds open (an asleep agent can be held most of a minute) gives up its slot after `FAN_OUT_SLOT_LEASE_MS` (2 s) and keeps running, so a few held reads never serialize the roster. Reads for the agent the person is looking at skip the gate. `globalTimers` is read at call time so fake timers apply in tests.

## React binding

`@houston/sdk/react` ships one hook, `useSdkSnapshot`, which takes the SDK as an argument. There is no provider or context: the web app already threads its one client explicitly (`packages/web/src/new-engine/app.tsx`), and a context would be a second route to the same object. Add one only when a consumer needs it.

`snapshotStoreAdapter` (`react/use-sdk-snapshot.ts`) defers React's change notification to a macrotask. `useSyncExternalStore` answers every notification with a sync-lane render, and React 19 counts consecutive sync commits that leave other work pending as one nested-update chain. A turn stream delivers frames with only microtask gaps, and a reconnect replay hands over dozens at once, so notifying per publish ran 50+ sync commits in one task and React threw "Maximum update depth exceeded" (#185) into the publisher, failing the turn. A microtask would not help because it interleaves with the stream's own microtasks. `getSnapshot` stays synchronous, so any render in between already reads the latest value. `getSnapshot` doubles as the server snapshot because the store returns the same reference until a publish.

## Subpath modules for node:test

The app's unit tests run under `node --experimental-strip-types`, where the barrels' extensionless internal imports do not resolve and parameter properties are rejected. So several files are published as their own subpaths in `packages/sdk/package.json` (`agent-name`, `job-description`, `first-day`, `provider-catalog`, `quiet-error-class`, `transport-failure`, `abort-signal`, `auth-replay`, `no-agent-provider-write-error`, and the module subpaths named in each family's ADR). They stay dependency-free beyond other subpaths, use erasable syntax only, and import each other by package self-reference. Surface code should import these rules from the subpath, not the barrel.

- `provider-catalog.ts`, `agent-name.ts`, `job-description.ts` and `first-day.ts` re-export rules that live once in `@houston/domain`. The provider tables moved there after the app's copies drifted: the icon path aliased `openai-codex` to `openai` while the label path did not, and the Anthropic default differed between the app and the user-data migration.
- `abort-signal.ts` polyfills `AbortSignal.timeout` and `AbortSignal.any`. macOS 10.15 is the desktop minimum and its WebKit (Safari 15) has neither, so a direct call throws before the request is made.

## Small shared structures

`lru.ts` keeps the most recently used entries plus pinned ones, which are never evicted, because a live entry must not vanish under an active turn. Eviction is used only where the value is rebuilt from history on next access. An identical copy lives in `packages/runtime/src/lru.ts`; the two packages share no dependency that could host it, so the small structure is duplicated rather than pushed across a boundary.

`observeProviderConnection` (`provider-connection-observer.ts`) owns retry and completion for a requested provider connection. Evidence must come from a fresh host probe, never a cache, and a person's Cancel invalidates even an in-flight probe until an explicit retry, so a dismissed chat cannot resume later.
