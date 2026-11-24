# AI provider connections and the local model bridge

The providers module (`packages/sdk/src/modules/providers`) connects an agent to an AI provider and reports its status. The local model bridge (`packages/sdk/src/local-model-bridge`) connects a model served on the person's own machine to a hosted agent through a native tunnel. Both carry credentials or long-lived sessions, which is why their rules are stricter than the other modules'.

## Two credential write surfaces, both needed

There are two ways to write a provider credential, and neither replaces the other.

- `writes.ts` calls the agent's own runtime through `clientFor(agentId)` (`/agents/:id/auth/:provider/api-key`, `/agents/:id/providers/openai-compatible`). Those calls land in the pod's local `auth.json`. This is the only surface a local engine with no gateway in front of it serves.
- `credentials.ts`, `setup-credentials.ts` and their facade `credential-store.ts` call the host's control routes (`/agents/:id/credential/*`, `/setup-runtime/credential/*`). The host stores the credential in the workspace's central store, which every agent in the space serves from, and pushes it into the standing runtime as a side effect. The web app connects providers this way. A write to the runtime surface instead would leave the central store empty, and the next turn would rehydrate the agent from that store and lose the key or undo the sign-out.

Rules for the central-store writes:

- No write carries a scope in any form. The server decides whose account a write lands on from the space the request is made in: a team space has no shared AI credential, so the write is the acting member's own, and a personal space has exactly one. A client-sent scope could only repeat or contradict that. `packages/web/tests/credential-write-urls.test.ts` pins the URLs byte for byte so no query parameter creeps back.
- The secret travels in the body, never in the path or query, so it cannot reach a log line or an error message that carries a URL.
- Every non-2xx throws `ProvidersHttpError` with the host's reason. A connect that reported success without storing anything is the one failure the person cannot see.
- `credential-store.ts` is not registered as commands. A command is a JSON `dispatch` envelope, and a pasted or machine-minted secret never travels in one. The app calls this facade directly.
- The host keeps one hidden setup runtime per space until the first agent exists. It is the only runtime that can hold a credential while no agent does, so first-run onboarding and a space whose last agent was deleted both write through `setup-credentials.ts`.

## The per-agent provider snapshot

`createProvidersModule` (`index.ts`) publishes one scope per agent, `providers/<agentId>`, merged in `merge.ts` from two reads of the same runtime. `GET /providers` is the base (models, active model, availability) and `GET /auth/status` overlays `configured`, the in-flight `login`, the Copilot `enterpriseUrl` and `activeProvider`.

- The merge unions by id, list order first and auth-only providers appended, so nothing the wire reported is dropped. `configured` prefers the auth-status value. `isActive` is computed as `id === activeProvider` rather than copied from the list's flag, which can be stale.
- `loadSeq` (`operations.ts`) is a per-agent request sequence, so a slow full refresh that resolves after a newer one never publishes over it. A refresh keeps the prior providers while loading instead of flushing to empty.
- Login is imperative and the SDK owns no timer. `login` returns the `LoginInfo` verbatim; the surface polls `refreshStatus`, a status-only read, until `configured` flips, or calls `completeLogin` with a pasted code. A status failure right after starting a login must not hide the `LoginInfo` the person needs.
- `overlayStatus` keeps the prior snapshot's model info. The `reconnectBy` deadline rides only `GET /providers` (the gateway stamps it there), so a status-only poll keeps the prior deadline. A finished sign-in starts a new login whose deadline the poll did not read, so `signInFinished` marks the list as owed and `readOwedList` fetches it. That debt clears only when a read's snapshot is published.
- `ProvidersWrites` is the no-refetch write set for a host that owns its own read model (the web adapter with `reactivity: false`). The refetching facade delegates to these same primitives and then refreshes, so each call has one implementation.
- `SetModelOptions` goes through the shared `resolveModelSettings`, which pairs a model with its owning provider because the runtime refuses a model that belongs to a different active provider. `mode` is a per-turn pin and is never written as an agent-wide setting.
- 401s need no handling in this module. `ports.fetch` is the shared auth-fetch, which reports every 401 it stamps.

## The status read is declared for the assistant

`http.ts` declares `GET /providers` even though the picker reaches it through the runtime client's `listProviders` (it must also work against a local engine). Every provider write is credential plumbing and hidden from the assistant catalog, so without this declaration the AI Manager could change an agent's provider without being able to ask which providers exist, and it would guess ids. `ProviderRow` types the id as a plain string because `ProviderInfo["id"]` is an open union (pi's registry drifts) that JSON Schema cannot express.

## Reconnect warnings

A hosted Claude subscription login ends about 28 days after sign-in, however often Houston refreshes it, and then every routine on that account stops. The gateway puts the deadline on the provider status as `reconnectBy`. `providerReconnectNotice` (`reconnect.ts`) is the one rule that reads it, so desktop, web and the AI Manager warn on the same day: `RECONNECT_NOTICE_DAYS` (5) before the deadline, counting down by whole days to 0, and nothing once the provider is already signed out (the reconnect card covers that).

## Local model bridge

### Expected states are quiet

`BridgeQuietClass` (`quiet.ts`) lists the bridge failures that are expected states. A surface reports each as one fingerprinted warning and shows nothing red, and no surface re-derives the classification.

- `bridge_unsupported`: the deployment's `/v1/capabilities` has no bridge v1. `isBridgeUnsupported` (`unsupported.ts`) stops discovery, because a server's shape does not change on a retry curve and polling it every 30 s would be noise.
- `bridge_no_agent`: the space has no agent yet. The retry curve resolves it.
- `bridge_state`: the SDK's own retry states (`model_unavailable`, `reconnecting`), plus the raw answers that lead to them: the native side failing to reach the relay (`isBridgeRelayUnreachable`), a stale renewal (`isStaleBridgeSession`) and a migration the gateway sends back for a reconnect (`isMigrationReconnect`).
- A relay handshake answered with an HTTP status ("Bridge connection refused (401)") is not unreachable. The network worked and the server said no, so it stays a loud report. `isBridgeRelayUnreachable` matches the plain strings the Rust `BridgeError` renders (`crates/local-model-bridge/src/types.rs`).
- `isBridgeCancellation` covers an operation whose lifetime was invalidated by a space, agent or account switch, or one that reached a controller already disposed (`BridgeDisposedError`). Nothing broke and a newer scope owns the bridge, so it is reported nowhere, not even as a quiet class. `resume.ts` counts only the bridge's own abort signal this way. A foreign `AbortError`, such as WebKit's "Fetch is aborted" on a dropped connection, is a real failure.

### Registration refusals are forgotten

`isRegistrationRefusal` (`errors.ts`) treats a 403 (model ceiling, role, agent gone) or a 400/422 as final: nothing was registered under the journal's key, so the SDK forgets the attempt and the bridge settles disabled (`BridgeRegistrationRefusedError`). Keeping it made every boot re-register and be refused, and the retirement every later connect or disconnect runs first was refused the same way, so the agent's local model could never change. A 401 is a lost session, never this. In `retry.ts` a stale renewal is also a 409 but a fresh session recovers it, so it is checked before the permanent refusals.

### Durable, idempotent writes

- `transaction.ts` keeps the prepared idempotency key in the journal if the write fails, and reconciles an aborted or ambiguous result through the same idempotent save. `retirement.ts` recovers a lost registration response with its original key, never a new intent, and a manual retirement replaces any pending endpoint-clear intent.
- `observeBridgeJournal` (`journal.ts`) publishes only durable state this scope owns, including writes that finish after cancellation. Cleanup stays durable, and a cleanup failure never replaces the caller's abort error: `cancelPreparedBridge` (`cancellation.ts`) reports it instead.
- `lifecycle.ts` drains pending writes and logout before replacing a connection, and a healthy committed connection stays live, renewal included, until the new settings succeed.
- `bootstrapLocalModelBridge` retries only discovery and port construction. The factory never starts inference or a bridge.

### Renewal survives background idle

`renew` (`controller.ts`) runs from two schedules: the webview timer and the native `renewalDue` notice two minutes before expiry. macOS App Nap suspends webview timers while the app idles, so the native notice is what keeps a session alive overnight. The `expected` expiry fence stops both from renewing the same session. `withNativeCancellation` (`native-start.ts`) sends the identity-scoped native stop from the abort callback, so cancellation interrupts an in-flight dial instead of queuing behind it.

### Subpath modules use erasable syntax

`errors.ts`, `quiet.ts` and `unsupported.ts` are loaded by the app's `node:test` runner through package subpaths (`@houston/sdk/local-model-bridge/*` in `packages/sdk/package.json`). Node's type stripping rejects parameter properties and resolves no extensionless relative import, so these files use only erasable syntax and import each other by package self-reference.
