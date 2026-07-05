# Integrations (Composio, platform mode)

How Houston connects third-party apps (Gmail, Slack, …) so agents can act on
them. Composio is the first and only provider today, wired **behind a port** so a
second provider slots in without touching anything above it. This doc covers the
host architecture, the grants model (multiplayer + the NEW local grants), and the
UI map.

> Not an AI provider. Integrations are tool connections, NOT LLM providers — they
> go through `IntegrationProvider`, never the pi provider registry.

---

## 1. Platform-mode architecture (host)

**Platform model.** Houston holds ONE Composio project API key. Every Houston
user is a plain Composio `user_id` under that project; users never create a
Composio account, they only OAuth the app itself (Composio hosts the dance). The
key is cloud/self-host only — it must never ship in a client binary.

**The port** — `packages/host/src/integrations/provider.ts`
`IntegrationProvider`: `readiness`, `listToolkits`, `listConnections(userId)`,
`connect(userId, toolkit)`, `connection`, `disconnect`, plus the two the agent's
generic tools call: `search(userId, query, acting?)` and
`execute(userId, action, params, acting?)`. Host routes + tools depend ONLY on
this interface; no provider SDK/wire type leaks past its adapter. Availability is
a capability flag (`/v1/capabilities` `integrations`), not a forked build — same
code everywhere, no drift.

**Two adapters, one interface:**
- `ComposioProvider` (`composio.ts`) — the **direct** adapter. Speaks Composio v3
  REST directly (`x-api-key`), no CLI/SDK. Used by cloud + self-host, which hold
  the key. `userId` scopes each user's connections. Connect uses
  `POST /api/v3.1/connected_accounts/link`.
- `RemoteIntegrationProvider` (`remote.ts`) — the **gateway** adapter, the
  desktop's provider. The desktop holds NO key: every port call is forwarded to
  Houston's cloud host `/v1/integrations/*` with the user's Supabase session
  token. The upstream verifies the JWT and re-derives the Composio `user_id` from
  its `sub`, so a client can never act as another user and connections follow the
  user across desktop and cloud. The port's `userId` args are ignored here.

**Registry** (`registry.ts`) — `IntegrationRegistry` keyed by provider id. Empty
registry is valid (integrations off → capability false, routes 404/503). Duplicate
id is a wiring bug (throws), unknown id throws (never silently undefined).

**Session sync (desktop).** The frontend owns the Supabase session; the gateway
adapter needs it fresh. `setIntegrationSession(token | null)` pushes the current
token (null on sign-out). With no session the adapter reports not-ready and throws
`IntegrationSigninRequiredError`, surfaced as an actionable 409/sign-in state.

**Sandbox path.** The agent runtime never talks to a provider directly. Its
generic tools call the host over the per-sandbox proxy
(`routes/integrations-sandbox.ts`); the sandbox HMAC token binds
`{workspaceId, agentId}` (`EnvCredentialVault`), so the route knows which agent is
acting without extra plumbing. `search`/`execute` receive the `ActingContext`
(C2): `actingAs` (per-turn token) or `actingUser` (routine creator's `sub`); the
direct adapter ignores both (identity is the verified `userId`).

---

## 2. Grants model — which agents may use which app

### Multiplayer (cloud gateway, C4)
Per-`(user, agent)` grant set of toolkit slugs, owned by the cloud gateway. The
gateway filters `search` to granted toolkits and refuses `execute` of an ungranted
toolkit. See `convergence/contracts/C4-grants.md` and `C1-integrations-api.md`.

### Local / self-host grants (NEW — desktop + self-host parity)
`packages/host/src/integrations/grants.ts` (`LocalIntegrationGrants`) +
`grant-store.ts` (`IntegrationGrantStore` port; `FileIntegrationGrantStore` stores
per-agent JSON at `<agent>/.houston/integration-grants.json`, atomic tmp+rename,
corrupt/missing reads as no-record). Same policy the gateway serves, brought to
single-player. Key semantics:

- **Materialize-on-first-read = all connected.** GET on an agent with NO record
  materializes the record as ALL toolkits the user currently has connected
  (statuses `active`+`error`, never `pending`), persists it, and enforcement
  begins from there. This preserves the old behavior (every agent could use every
  connected app) for existing users while giving a real editable record going
  forward.
- **Provider not ready → `[]` WITHOUT persisting** (signed-out gateway throws
  `IntegrationSigninRequiredError` → same outcome), so a later signed-in read
  materializes the real set instead of freezing an empty one.
- **Concurrency-guarded.** Concurrent first-reads share one in-flight promise —
  the default is computed and persisted exactly once.
- **Enforcement once a record exists.** `grantedOrNull(agentId)` returns the set
  when a record exists, else `null` = "no record, do not filter". The sandbox
  route filters `search` (`filterMatchesToGranted`) and 403s `execute`
  (`isActionGranted` → `toolkit_not_granted`) only when `granted` is non-null.
- **Toolkit attribution.** Search results carry the authoritative `toolkit`
  field. Execute has only the action slug, so it uses the Composio slug convention
  (`toolkitOfAction`: prefix before the first `_`, lowercased —
  `GMAIL_SEND_EMAIL` → `gmail`), matching the gateway's C1 enforcement exactly.
- **Gateway-fronted pods never serve the routes.** `LocalIntegrationGrants` is
  constructed in `buildLocalHost` ONLY when `registry && !gatewayFronted`. On a
  managed cloud pod (`HOUSTON_MANAGED_CLOUD`) the dep is unset → the grant routes
  fall through to 404 and the sandbox proxy enforces nothing (the fronting gateway
  owns policy). Integrations unconfigured (no registry) → also unset → 404.

Routes: `GET`/`PUT /v1/agents/:agentId/integration-grants`
(`routes/integration-grants.ts`). PUT is a replace-set (validated array of
`[a-z0-9_-]+`, deduped; 400 otherwise).

### Client 404 → `null` degradation
`engine-client` `agentIntegrationGrants()` returns `Promise<string[] | null>`:
`null` IFF the host answered 404 (grants unsupported — old build or gateway-fronted
pod); every other error throws. The app hook `useAgentGrants` is typed
`string[] | null`; `useAllAgentGrants` sets `supported=false` once any agent
resolves `null`. **`null` means "unsupported, show no per-agent toggles"; `[]`
means "record exists, nothing granted"** — distinct. The grant PUT mutation
no-ops when the cache is `null`, so it is safe even wired in an unsupported
deployment.

---

## 3. UI map

Gated on `HOST_BUILD` (`app/src/agents/standard-tabs.ts`) — a deterministic build
constant, not the runtime handshake. Absent in the legacy Rust engine build.

**Shared module** — `app/src/components/integrations/` (`index.ts` is the surface;
pure model in `model.ts`/`app-display.ts`, DOM-free and node-tested). Both surfaces
consume it verbatim — no forked copies. Notable exports: `AppCatalogPicker`,
`AppDetailSheet`, `AppRow`, `AgentChips`, `PendingConnectionCallout`,
`IntegrationDisconnectDialog`, the gate/flow hooks below, and pure helpers
`browseCatalog`/`splitByGrant`/`pollConnectionUntilActive`.

**Global page** — `app/src/components/integrations-view/`, top-level view
`INTEGRATIONS_VIEW_ID = "integrations-home"` (NOT `"integrations"`, which is the
per-agent tab id — a shared slug would shadow the tab; like `dashboard`/`settings`
a top-level view lives OUTSIDE `STANDARD_TAB_IDS`). Sidebar nav + the render branch
live in `shell/workspace-shell.tsx` / `shell/sidebar.tsx`. Lists every connected
app, the agents using each (`AppDetailSheet` per-agent Switch), disconnect
(scope `everywhere`, names affected agents), and adding apps (connect-only picker).

**Agent tab** — `app/src/components/tabs/agent-integrations/`
(`integrations-tab.tsx` re-exports the orchestrator). A discriminated union:
`grants` mode (multiplayer/local record → "Apps this agent can use", activation
toggles, picker in agent context with a "Ready to activate" group) vs `degraded`
mode (grants `null` → all connected apps shown usable, no fake toggles). "Manage
all integrations" navigates to `INTEGRATIONS_VIEW_ID`.

**Connect flow + pending recovery** — `useConnectFlow` (in the shared module) lives
on the SURFACE, never inside the picker, so closing the dialog never kills polling.
It mints the hosted link, opens the browser, polls until active (a `Waker` backs
the sleep so `checkNow()` wakes an immediate poll and `cancel()` returns
`"cancelled"`), then invalidates connections. In agent context a fresh connection
is auto-granted. An abandoned OAuth (user closed the tab) is ALWAYS recoverable
from both surfaces via `PendingConnectionCallout` (pending → Finish connecting;
error → Reconnect; both a fresh link) + Remove. While any connect is waiting,
other Connect buttons are disabled (single flight). Only outcomes `call()` cannot
see are toasted (timeout, provider-side OAuth failure); a cancel is silent by
design.

**No silent failures.** All engine mutations route through `call()`
(`app/src/lib/tauri.ts`), which toasts + reports once, so the integration hooks
carry NO `onError` (a second toast would double up). See `useAgentGrantMutation`.
