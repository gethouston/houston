# @houston/sdk

The **single headless Houston client** — one client implementation that sits
under the desktop and web app, bound through `@houston/engine-adapter`.
No UI, no framework. Reactive state in, commands out. React bindings live behind
the `./react` subpath; everything else here is framework-agnostic.

Why one client? Every surface used to grow its own fetch/cache/state glue and
drift. `@houston/sdk` collapses that into a single kernel + typed modules, so a
behaviour is implemented once and observed identically everywhere.

It is the single source of truth for client capability: one module per gateway
family, bound by the engine adapter through its `viaSdk` mixins, which is the
desktop client too, since `app/src` runs verbatim as `packages/web`. The wire
each family puts on the network is pinned by `packages/web/tests/wire-*.test.ts`,
and `pnpm check:sdk-parity` fails on a gateway route the app calls with no
method here.

> **Changing client behavior?** Follow the layers of the SDK contract (root
> `CLAUDE.md` → "SDK is the single source of truth"). A VM-snapshot change is a
> contract change — additive only, same discipline as protocol v3.

## Ports (injected capabilities)

The kernel never touches a global directly. Every side effect arrives through
`SdkPorts`, so the same code runs in a browser, an SSR worker, or a test:

| Port | Shape | Purpose |
| --- | --- | --- |
| `fetch` | `typeof fetch` | HTTP/SSE transport for the engine client |
| `storage` | `KeyValueStore` (`get`/`set`/`delete`, async) | the SDK's OWN persisted state (the session token), namespaced by the host |
| `devicePreferences` | `KeyValueStore` | this DEVICE's UI preferences, in the app's own key names (the appearance). A blocked or full store rejects rather than degrading to memory: the user acted, so a failure has to surface |
| `clock` | `Clock` (`now`/`setTimeout`/`clearTimeout`) | time + scheduling, mockable |
| `logger` | `SdkLogger` (`debug`/`info`/`warn`/`error`) | structured, leveled diagnostics |

`SdkConfig = { baseUrl, ports }` is everything needed to construct a `HoustonSdk`.

Browser-safe: no `node:*` imports. Boundary-safe: this is an OPEN package — it
imports no `cloud` code.

## The model — scopes, snapshots, commands

**Reads are snapshots keyed by scope.** A scope is a string address for a
reactive surface. There is one module per gateway family (`src/modules/`), and
the reactive ones own these scopes:

| Module | Scope | Snapshot (view-model) | Commands |
| --- | --- | --- | --- |
| session | `"connection"` | `ConnectionViewModel` `{ status, baseUrl, hasToken }` | `session/setToken` |
| agents | `"agents"` | `AgentsViewModel` `{ loaded, items[] }` | `agents/refresh` · `create` · `rename` · `delete` |
| conversations | `"conversations/<agentId>"` | `ConversationListVM` `{ loaded, items[] }` (the LIST) | `conversations/refresh` · `rename` · `delete` |
| turns | `"conversation/<id>"` | `ConversationVM` `{ feed[], running, sessionStatus }` (the live feed) | `turns/send` · `turns/cancel` |

One module is not a gateway family at all: `appearance` owns the theme mode and
the palette each mode wears, which are this DEVICE's state — read and written
through the `devicePreferences` port, with no route, no wire test and no entry in
the assistant catalog (an operation there is derived from the request it issues,
and a coordinator in an engine pod cannot reach the screen a person is sitting
at). Its vocabulary and rules are also published as `@houston/sdk/appearance`,
because a surface resolves a theme on its first frame, before any kernel exists.

Note the conversations module owns the per-agent LIST scope
(`conversations/<agentId>`); the turns module owns each conversation's live feed
VM (`conversation/<id>`) — two different scopes, no collision.

A module owns a scope and `publish`es the WHOLE new value on every change.
Consumers `getSnapshot(scope)` for the current value and `subscribe(scope, cb)`
for changes. There is also a global one-shot event channel (`on(cb)` /
`SdkEvent`) for signals that are not themselves reactive state.

**Writes are commands.** A command is a JSON `CommandEnvelope`
(`{ id, type, payload? }`) that resolves to a JSON `CommandResult`
(`{ id, ok: true, value? }` or `{ id, ok: false, error }`). Handlers register
once into a shared registry (duplicate `type` throws — a wiring bug, not
last-writer-wins).

**Two callers, one implementation.** Ergonomic typed facade methods
(`sdk.agents.…`) and command dispatch (`sdk.dispatch(envelope)`) hit
the *same* registered handler. The desktop and web app call the SDK through
`@houston/engine-adapter`.

Everything crossing `getSnapshot` / `subscribe` / `dispatch` / `on` is plain
JSON — no functions, no class instances — so it survives a structured-clone
boundary unchanged.

### Why snapshots, not patches

Houston's event rates are UI-scale (a human chatting with agents), not
high-frequency telemetry. At that scale "publish the latest whole value, latest
wins" is dramatically simpler than maintaining a diff/patch protocol with
sequence reconciliation, and it removes an entire class of desync bugs.
Simplicity wins here. **Roadmap:** if a scope ever grows large enough that
re-sending it per change hurts, we revisit *that scope* with incremental
patches — the `publish(scope, snapshot)` API is deliberately the only thing a
patch layer would sit behind.

## Shape

```
src/
  ports.ts           # SdkConfig + injected capability ports
  store.ts           # ScopeStore — snapshots + event channel (the read side)
  commands.ts        # CommandEnvelope/Result + CommandRegistry (the write side)
  auth-expiry.ts     # shared 401 → session/tokenExpired notifier (one per SDK)
  module-context.ts  # ModuleContext handed to every module factory
  sdk.ts             # HoustonSdk — composes store + per-agent clients + modules
  index.ts           # public entry (kernel + each module's contract)
  modules/           # one per gateway family (session, agents, turns, files, billing, …)
  react/             # React bindings (exported as @houston/sdk/react)
```

Modules are internal: `HoustonSdk`'s constructor composes each
`create<Name>Module(ctx)`, which registers command handlers and returns a typed
facade exposed as a property (`sdk.session`, `sdk.agents`, …). The `ctx`
({@link ModuleContext}) threads one shared store, a memoized per-agent engine
client resolver (`clientFor(agentId)` — the host nests routes under
`/agents/<id>`), and the shared auth-expiry notifier, so every module speaks the
same transport and emits one canonical `session/tokenExpired` signal. Tear the
SDK down with `sdk.dispose()` (stops the agents, activities, and conversation
reactivity streams plus every in-flight turn stream). Clients receive
`ConversationsChanged` through the turns module: subscribed conversation VMs
reload their persisted history, including after an idle observer has closed.

## Out of scope for v1

Deliberately not built yet (add when a real surface needs them):

- **Push port** — no server-push/WebSocket capability port; reactivity is engine
  SSE via the injected `fetch` plus snapshot publishes.
- **Offline writes** — no command queue/outbox; commands assume connectivity and
  fail with `ok: false` when the engine is unreachable.
