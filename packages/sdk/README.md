# @houston/sdk

The **single headless Houston client** — one client implementation that sits
under every surface: web, desktop (Tauri), and native (iOS/Android via a bridge).
No UI, no framework. Reactive state in, commands out. React bindings live behind
the `./react` subpath; everything else here is framework-agnostic.

Why one client? Every surface used to grow its own fetch/cache/state glue and
drift. `@houston/sdk` collapses that into a single kernel + typed modules, so a
behaviour is implemented once and observed identically everywhere.

> **Changing client behavior?** Follow procedure a of the three-surface
> maintenance contract: `knowledge-base/client-architecture.md`. A VM-snapshot
> change is a contract change — additive only, same discipline as protocol v3.

## Ports (injected capabilities)

The kernel never touches a global directly. Every side effect arrives through
`SdkPorts`, so the same code runs in a browser, a native bridge, an SSR worker,
or a test:

| Port | Shape | Purpose |
| --- | --- | --- |
| `fetch` | `typeof fetch` | HTTP/SSE transport for the engine client |
| `storage` | `KeyValueStore` (`get`/`set`/`delete`, async) | persistent strings (tokens, prefs) |
| `clock` | `Clock` (`now`/`setTimeout`/`clearTimeout`) | time + scheduling, mockable |
| `logger` | `SdkLogger` (`debug`/`info`/`warn`/`error`) | structured, leveled diagnostics |

`SdkConfig = { baseUrl, ports }` is everything needed to construct a `HoustonSdk`.

Browser-safe: no `node:*` imports. Boundary-safe: this is an OPEN package — it
imports no `cloud` code.

## The model — scopes, snapshots, commands

**Reads are snapshots keyed by scope.** A scope is a string address for a
reactive surface. As built, the four modules own these scopes:

| Module | Scope | Snapshot (view-model) | Commands |
| --- | --- | --- | --- |
| session | `"connection"` | `ConnectionViewModel` `{ status, baseUrl, hasToken }` | `session/setToken` |
| agents | `"agents"` | `AgentsViewModel` `{ loaded, items[] }` | `agents/refresh` · `create` · `rename` · `delete` |
| conversations | `"conversations/<agentId>"` | `ConversationListVM` `{ loaded, items[] }` (the LIST) | `conversations/refresh` · `rename` · `delete` |
| turns | `"conversation/<id>"` | `ConversationVM` `{ feed[], running, sessionStatus }` (the live feed) | `turns/send` · `turns/cancel` |

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
(`sdk.agents.…`) and the serialized bridge path (`sdk.dispatch(envelope)`) hit
the *same* registered handler. Native shells serialize an envelope; in-process
callers use the facade; neither duplicates write logic.

Everything crossing `getSnapshot` / `subscribe` / `dispatch` / `on` is plain
JSON — no functions, no class instances — so it survives a structured-clone or
native-bridge boundary unchanged.

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
  modules/           # session, agents, conversations, turns
  react/             # React bindings (exported as @houston/sdk/react)
```

Modules are internal: `HoustonSdk`'s constructor composes each
`create<Name>Module(ctx)`, which registers command handlers and returns a typed
facade exposed as a property (`sdk.session`, `sdk.agents`, …). The `ctx`
({@link ModuleContext}) threads one shared store, a memoized per-agent engine
client resolver (`clientFor(agentId)` — the host nests routes under
`/agents/<id>`), and the shared auth-expiry notifier, so every module speaks the
same transport and emits one canonical `session/tokenExpired` signal. Tear the
SDK down with `sdk.dispose()` (stops the agents reactivity stream and every
in-flight turn stream).

## Out of scope for v1

Deliberately not built yet (add when a real surface needs them):

- **Push port** — no server-push/WebSocket capability port; reactivity is engine
  SSE via the injected `fetch` plus snapshot publishes.
- **Offline writes** — no command queue/outbox; commands assume connectivity and
  fail with `ok: false` when the engine is unreachable.
- **Full control-plane migration** — the SDK wraps the conversation/agent surface
  first; broader control-plane operations stay on their current paths until
  migrated deliberately.
- **Native bridge implementation** — the `dispatch`/snapshot contract is native-
  ready (all JSON), but the actual iOS/Android bridge host is not in this package.
