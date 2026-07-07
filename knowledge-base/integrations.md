# Integrations (Composio, platform mode)

How Houston connects third-party apps (Gmail, Slack, …) so agents can act on
them. Composio is the first and only provider today, wired **behind a port** so a
second provider slots in without touching anything above it. This doc covers the
host architecture, the grants model (multiplayer + local grants), and the UI map.

> **Grant unit = the connected ACCOUNT (`connectionId`), not the toolkit.** A user
> can connect several accounts of the SAME app (two Gmail logins, a work + personal
> Slack) and grant each agent a different subset. Allowlist CEILINGS (Teams) stay
> toolkit-level; only grants and disconnect/rename operate per account.

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
`connect(userId, toolkit)`, `connection`, `disconnect(userId, connectionId)`,
`rename(userId, connectionId, alias)`, plus the two the agent's generic tools call:
`search(userId, query, acting?) → SearchResult` and
`execute(userId, action, params, opts?: { acting?, account? })`. `disconnect` and
`rename` are PER-ACCOUNT and ownership-checked; `rename` is NEW. `search` now
returns `SearchResult { items; accounts? }` (the policy layer fills `accounts` with
the acting agent's granted accounts; direct adapters return `items` only). Host
routes + tools depend ONLY on this interface; no provider SDK/wire type leaks past
its adapter. Availability is a capability flag (`/v1/capabilities` `integrations`),
not a forked build — same code everywhere, no drift.

**Types** (`integrations/types.ts`, mirrored in `ui/engine-client` as
`IntegrationConnection` and in `cloud`): `Connection { toolkit; connectionId;
status; accountLabel? }`; `ConnectedAccountInfo { toolkit; connectionId;
accountLabel? }`; `SearchResult { items: ToolMatch[]; accounts?:
ConnectedAccountInfo[] }`. `accountLabel` is derived from the raw connected account
in the Composio adapter (`deriveAccountLabel`, `composio-wire.ts`): the non-empty
alias, else the first non-empty string among `state.val` keys
[`email`,`user_email`,`username`,`account`,`account_id`,`login`,`domain`,
`subdomain`,`workspace`,`team`,`name`], else `word_id`, else `undefined`.

**Two adapters, one interface:**
- `ComposioProvider` (`composio.ts`) — the **direct** adapter. Speaks Composio v3
  REST directly (`x-api-key`), no CLI/SDK. Used by cloud + self-host, which hold
  the key. `userId` scopes each user's connections. Connect uses
  `POST /api/v3.1/connected_accounts/link` with `allow_multiple: true` (so a user
  can add a second account of an app). Per-account `disconnect`
  (`DELETE /api/v3/connected_accounts/{id}`) and `rename`
  (`PATCH …/{id}` body `{ alias }`) both go through a shared `ownedAccount()` guard
  first — GET the account, verify `body.user_id === userId`, fail CLOSED — so a
  client can never touch another user's account. `execute` sends
  `connected_account_id` in the body ONLY when `opts.account` is set; callers must
  resolve a label to a real `connected_account_id` before calling the direct
  adapter. `search` returns `{ items }` (no `accounts` — enrichment is the policy
  layer's job).
- `RemoteIntegrationProvider` (`remote.ts`) — the **gateway** adapter, the
  desktop's provider. The desktop holds NO key: every port call is forwarded to
  Houston's cloud host `/v1/integrations/*` with the user's Supabase session
  token. `disconnect` sends `{ connectionId }`, `rename` POSTs
  `/connections/:id/rename { alias }`, `execute` forwards `opts.account` verbatim
  (upstream resolves labels), and `search` relays the upstream `SearchResult`
  as-is. The upstream verifies the JWT and re-derives the Composio `user_id` from
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
direct adapter ignores both (identity is the verified `userId`). The `execute`
route also carries the optional `account` (id or label) through to account
resolution (below).

---

## 2. Grants model — which agents may use which app

### Multiplayer (cloud gateway, C4 + C7)
Per-`(user, agent)` grant set of connected ACCOUNTS (`connectionId`s), owned by the
cloud gateway. The gateway filters `search` to the granted accounts' toolkits and
refuses `execute` unless the action's toolkit is granted AND an account is
resolved. See `cloud/docs/contracts/C4-grants.md` and `C1-integrations-api.md`.

**Grants are bounded by an allowlist CEILING (Teams v2, C7).** Two ceilings sit
above the grant set: an **org** ceiling (`org_settings`) and a per-**agent**
ceiling (`agent_settings`). A toolkit is usable only if it is BOTH granted AND
inside the effective allowlist:

```
effectiveAllowlist = intersect(orgCeiling ?? ALL, agentCeiling ?? ALL)
```

`null` = unrestricted (ALL), `[]` = none. The intersection is applied on TOP of
grants, never instead of them. When a ceiling **shrinks**, the gateway PRUNES
now-disallowed toolkits from existing grants so revocation takes effect
immediately. A per-agent **connect carries the agent slug**: the gateway checks
the toolkit against the effective allowlist and auto-grants it to the agent on a
successful OAuth (see `connectIntegration(provider, toolkit, agent?)`).

**Client + UI.** `getAgentSettings` / `setAgentSettings` read/replace the agent
ceiling (`allowedToolkits`, plus the read-only `orgAllowedToolkits` it's
intersected with and the caller's effective `access`; manager-only write).
`getOrgSettings` / `setOrgSettings` read/replace the org ceiling (owner-only
write). Copy lives under `teams:integrations.allowlist` ("Allowed integrations",
"Restrict to specific apps"); an agent tab also lists apps blocked by the
ceiling under `teams:integrations.notAllowed`. The manager editor lives in Agent
Settings > **Access** > **Allowed integrations** (`AgentAllowlistSection`); its
editing surface is `AllowlistAppGrid` — the Integrations-tab app catalog
(search + paginated app cards via the shared `AppRow`/`appDisplay`) with a
per-app allow toggle, not a dense checklist. Full client surface:
`knowledge-base/teams.md`.

### Local / self-host grants (desktop + self-host parity)
`packages/host/src/integrations/grants.ts` (`LocalIntegrationGrants`) +
`grant-store.ts` (`IntegrationGrantStore` port; `FileIntegrationGrantStore` stores
per-agent JSON at `<agent>/.houston/integration-grants.json`, atomic tmp+rename,
corrupt/missing reads as no-record). Same policy the gateway serves, brought to
single-player.

**Grant record v2 = accounts, not toolkits.** `GrantRecord` is a discriminated
union `{ stored: true; accounts: { connectionId; toolkit }[] } | { stored: false }`;
the file shape is `{ accounts: [{ connectionId, toolkit }] }`. Key semantics:

- **Legacy `{ toolkits: string[] }` upgrade.** A v1 file read is treated as
  no-record BUT one-time materialized to ALL currently-connected accounts (statuses
  `active`+`error`) of those toolkits, then persisted in the v2 shape.
- **Materialize-on-first-read = all connected accounts.** GET on an agent with NO
  record materializes the record as ALL accounts the user currently has connected
  (statuses `active`+`error`, never `pending`), persists it, and enforcement begins
  from there. Preserves the old "every agent could use every connected app"
  behavior while giving a real editable per-account record going forward.
- **Provider not ready → `[]` WITHOUT persisting** (signed-out gateway throws
  `IntegrationSigninRequiredError` → same outcome), so a later signed-in read
  materializes the real set instead of freezing an empty one.
- **Concurrency-guarded.** Concurrent first-reads share one in-flight promise —
  the default is computed and persisted exactly once.
- **Enforcement once a record exists.** `grantedOrNull(agentId)` returns the
  `{ connectionId, toolkit }[]` when a record exists, else `null` = "no record, do
  not filter". Pure policy helpers live in `grant-policy.ts`:
  `grantedToolkits` (distinct toolkits behind the accounts),
  `filterMatchesToGranted` (keeps `connected: false` rows for connect discovery),
  `toolkitForAction`/`actionInToolkit` (attach an action slug to a granted
  toolkit — full slug prefix up to an `_` boundary, so `GOOGLE_MAPS_GET_ROUTE`
  attaches to `google_maps`, never a phantom `google`), and
  `resolveExecuteAccount` (below).
- **Account resolution on execute** (`resolveExecuteAccount`): among the acting
  toolkit's granted accounts — a requested id/label matches by exact `connectionId`
  OR case-insensitive `accountLabel` (no match → `account_not_granted`); absent +
  exactly one granted account → auto-pin it; absent + more than one →
  `account_required` with the account list so the caller retries. The pinned id is
  passed as `opts.account` to `provider.execute`. NEVER call `execute` unpinned
  when granted accounts exist for the toolkit.
- **Gateway-fronted pods never serve the routes.** `LocalIntegrationGrants` is
  constructed in `buildLocalHost` ONLY when `registry && !gatewayFronted`. On a
  managed cloud pod (`HOUSTON_MANAGED_CLOUD`) the dep is unset → the grant routes
  fall through to 404 and the sandbox proxy enforces nothing (the fronting gateway
  owns policy). Integrations unconfigured (no registry) → also unset → 404.

**Wire shapes.** Grants: `GET`/`PUT /v1/agents/:agentId/integration-grants`
(`routes/integration-grants.ts`), body `{ accounts: string[] }` (connectionIds),
replace-set PUT. PUT validates every id against `provider.listConnections(user)` —
an unknown id → 400 `{ error: "invalid_accounts" }`; the toolkit is captured
server-side from the matched connection. GET materializes the default as above.
Per-account mutation routes: `POST /v1/integrations/:id/disconnect { connectionId }`
(was `{ toolkit }`); `POST /v1/integrations/:id/connections/:connectionId/rename
{ alias }` (alias trimmed, 1..64 chars, 400 otherwise) → `{ ok: true }`;
`POST /v1/integrations/:id/search` → `SearchResult` passthrough;
`POST /v1/integrations/:id/execute { action, params?, account? }`. The sandbox
`execute` returns 400 `{ error: "account_required", accounts: [...] }` when more
than one account is granted and none was pinned.

### Client 404 → `null` degradation
`engine-client` `agentIntegrationGrants()` returns `Promise<string[] | null>` (now
connectionIds; wire shape `{ accounts }`): `null` IFF the host answered 404 (grants
unsupported — old build or gateway-fronted pod); every other error throws.
`setAgentIntegrationGrants(id, accounts)` PUTs `{ accounts }`. Per-account client
methods: `disconnectIntegration(provider, connectionId)` (body `{ connectionId }`)
and the NEW `renameIntegrationConnection(provider, connectionId, alias)`. The app
hook `useAgentGrants` is typed `string[] | null`; `useAllAgentGrants` sets
`supported=false` once any agent resolves `null`. **`null` means "unsupported, show
no per-agent toggles"; `[]` means "record exists, nothing granted"** — distinct.
The grant PUT mutation no-ops when the cache is `null`, so it is safe even wired in
an unsupported deployment.

---

## 3. UI map

Gated on `HOST_BUILD` (`app/src/agents/standard-tabs.ts`) — a deterministic build
constant, not the runtime handshake. Absent in the legacy Rust engine build.

**One card per app, per-account rows inside.** The grant unit is `connectionId`
everywhere in the frontend model. A toolkit with several connected accounts still
renders as ONE app card; the accounts are labeled rows inside the card/detail
sheet. The account label falls back to `t("integrations:account.unnamed")` + the
last 4 chars of the `connectionId` when the connection has no `accountLabel`. Grant
toggles, Disconnect, and Rename are all PER ACCOUNT; "Add another account" re-runs
the connect flow for that toolkit.

**Shared module** — `app/src/components/integrations/` (`index.ts` is the surface;
pure model in `model.ts`/`app-display.ts`, DOM-free and node-tested). Both surfaces
consume it verbatim — no forked copies. Notable exports: `ConnectMoreAppsSection`
(the always-visible catalog block, below), `AppDetailSheet` (takes `connections[]` +
`activeAgentIdsByConnection` + per-account `onToggleAgent`/`onRename`/`onReconnect`/
`onDisconnect(connectionId)` + `onAddAccount(toolkit)`), the extracted
`AccountSection` (per-account label + inline Rename, StatusBadge, per-agent grant
switches, Reconnect/Disconnect), `AppRow`, `AgentChips`, `PendingConnectionCallout`
(keyed on a `connection` prop, Remove targets `connectionId`),
`IntegrationDisconnectDialog` (`onConfirm(connectionId)`, named by account), the
gate/flow hooks below, and pure helpers `browseCatalog`/`splitByGrant`
(buckets by `grants.has(c.connectionId)`) / `groupConnectionsByToolkit` /
`accountDisplayLabel` / `pollConnectionUntilActive`. `browseCatalog` sorts results
ALPHABETICALLY by app name (case-insensitive) after filtering. Grant mutations use
`GrantChange { connectionId, op }`; the per-agent inversion map is
`Map<connectionId, agentIds>`; `useConnectFlow` auto-grants the NEW `connectionId`
that `connect` returns.

**New i18n keys** (namespace `integrations`, en/es/pt, no em dashes):
`account.unnamed`, `account.addAnother`, `account.rename`, `account.renameTitle`,
`account.renamePlaceholder`, `account.save`, `account.cancel`,
`account.count_one`/`account.count_other`, `detail.accounts`.

**Always-visible catalog** — `ConnectMoreAppsSection` (wrapping the internal
`CatalogBrowser`) is a permanent "Connect more apps" section on BOTH surfaces, not
a dialog: a brand-new user with zero connections immediately sees the full ~1000-app
catalog. Apps list A-Z; category is a dropdown (categories A-Z); a search box
filters; "Load more" pages. It excludes already-connected toolkits (surfaced by the
caller's own grids) and renders the `ConnectWaitingPanel` inline for an in-progress
OAuth. There is NO add-apps dialog anymore (`AppCatalogPicker` was deleted).

**Global page** — `app/src/components/integrations-view/`, top-level view
`INTEGRATIONS_VIEW_ID = "integrations-home"` (NOT `"integrations"`, which is the
per-agent tab id — a shared slug would shadow the tab; like `dashboard`/`settings`
a top-level view lives OUTSIDE `STANDARD_TAB_IDS`). Sidebar nav + the render branch
live in `shell/workspace-shell.tsx` / `shell/sidebar.tsx`. TWO stacked sections:
**Connected apps** (a two-column grid of cards, ONE per toolkit — a multi-account
app shows an `account.count` subtitle and union agent chips; each card opens
`AppDetailSheet` over ALL that app's connections for per-account per-agent access,
rename, disconnect, and "Add another account"; pending/errored connections shown
full-width above the grid for recovery; omitted entirely at zero connections) then
the always-visible **Connect more apps** catalog. Disconnect is scope `everywhere`,
targets a single `connectionId`, and names affected agents.

**Agent tab** — `app/src/components/tabs/agent-integrations/`
(`integrations-tab.tsx` re-exports the orchestrator). THREE stacked sections, gated
by a discriminated union (`agentIntegrationsView` in `model.ts`, keyed on
`grants: string[] | null` of connectionIds): `grants` mode shows **Apps this agent
can use** (`activeRows`, per-account deactivate toggles) + **Apps connected to your
account** (`accountRows` — active connected accounts not yet granted, one-click
Activate = per-account grant-add, no OAuth; hidden when empty or read-only) +
`disallowedRows` (connected apps forbidden by the Teams allowlist ceiling, shown but
non-connectable); `degraded` mode (grants `null`) shows all connected accounts
usable with no toggles and no account section. When a toolkit has more than one row
in the SAME list, `showAccountLabel` flags those rows so the UI labels the accounts.
Both modes end with the always-visible **Connect more apps** catalog (auto-granting
a fresh connection to this agent in grants mode). "Manage all integrations"
navigates to `INTEGRATIONS_VIEW_ID`.

**Connect flow + pending recovery** — `useConnectFlow` (in the shared module) lives
on the SURFACE, never inside the picker, so closing the dialog never kills polling.
It mints the hosted link, opens the browser, polls until active (a `Waker` backs
the sleep so `checkNow()` wakes an immediate poll and `cancel()` returns
`"cancelled"`), then invalidates connections. In agent context a fresh connection
is auto-granted. An abandoned OAuth is recoverable inline on BOTH surfaces while
the flow is live via the `ConnectWaitingPanel` (Reopen / I have finished / Cancel).
A connection left pending/errored across sessions surfaces a `PendingConnectionCallout`
(pending → Finish connecting; error → Reconnect; both a fresh link) + Remove on the
global page and on the agent tab's own app rows (degraded mode, or grants mode once
granted). An ungranted orphaned pending connection is recovered from the global page
(the agent tab links there via "Manage all integrations"). While any connect is waiting,
other Connect buttons are disabled (single flight). Only outcomes `call()` cannot
see are toasted (timeout, provider-side OAuth failure); a cancel is silent by
design.

**No silent failures.** All engine mutations route through `call()`
(`app/src/lib/tauri.ts`), which toasts + reports once, so the integration hooks
carry NO `onError` (a second toast would double up). See `useAgentGrantMutation`.

---

## 4. Runtime tools (multi-account, `packages/runtime/src/session/tools/integrations.ts`)

The agent's two generic tools carry the account model to the model:

- **`integration_search`** consumes `SearchResult { items, accounts? }`. After the
  match list it appends, for every toolkit with MORE THAN ONE granted account, a
  line `Accounts for <toolkit>: "label" (id), ...` plus one instruction to pass
  `account` on execute for those toolkits.
- **`integration_execute`** takes an optional `account` param ("id or label of the
  connected account; needed only when the user has more than one account for that
  app"), forwarded in the POST body only when set. On HTTP 400 with
  `error === "account_required"` it RETURNS (does not throw) an instructive message
  listing the accounts as `"label" (id)` so the model retries with `account`; the
  typed `AccountRequiredError` carries the choices. Prompt guidance
  (`houston-prompt.ts` INTEGRATIONS + `houston_prompt/integrations.rs`) gained one
  non-technical sentence telling the agent a person may connect several accounts of
  one app and to ask which to use when unclear.
