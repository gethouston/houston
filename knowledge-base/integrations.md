# Integrations (Composio platform mode + custom integrations)

How Houston connects third-party apps (Gmail, Slack, …) so agents can act on
them. TWO providers live behind the port today: **Composio** (the hosted
catalog) and **`custom`** (user-added OpenAPI/MCP sources, HOU-550 — §4). This
doc covers the host architecture, the grants model (multiplayer + the NEW local
grants), the UI map, and the custom-integrations engine.

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
  Houston's cloud host `/v1/integrations/*` with the user's Firebase (GCIP) session
  (ID token). The upstream verifies the JWT and re-derives the Composio `user_id` from
  its `sub`, so a client can never act as another user and connections follow the
  user across desktop and cloud. The port's `userId` args are ignored here.

**Registry** (`registry.ts`) — `IntegrationRegistry` keyed by provider id. Empty
registry is valid (integrations off → capability false, routes 404/503). Duplicate
id is a wiring bug (throws), unknown id throws (never silently undefined).

**Session sync (desktop).** The frontend owns the Firebase (GCIP) session (refresh
via `app/src/lib/identity/refresh.ts`); the gateway
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

### Search flow + app-status taxonomy (HOU-681)

**The status contract.** Every search result carries an `IntegrationAppStatus`
(`packages/host/src/integrations/types.ts`) — the load-bearing enum that tells
the agent which of four speech acts to perform:

- `connected` — the acting user has an active connection: use it.
- `connectable` — a real toolkit, not connected yet: OFFER to connect
  (`request_connection`).
- `blocked` — a real toolkit excluded by org/agent admin policy: tell the user to
  ask their admin; never imply Houston lacks it, never `request_connection`.
  **Nothing in THIS repo produces `blocked`** — the allowlist ceiling lives solely
  in the closed cloud gateway (Teams v2, C7). The enum + rendering + prompt exist
  now so a later gateway change that annotates its `/search` items with `status`
  lights it up here with zero further work. (Distinct from the browse-catalog **locked
  rows** in §3: those are a CLIENT-SIDE intersection of the effective allowlist against
  the ~1000-app catalog, a visible-UI affordance, not this agent-facing search-status
  enum. The locked rows never set or read `blocked`.)
- `unknown` — not a recognized toolkit (reserved; today an unrecognized query is
  simply the EMPTY result).

`connected` is kept alongside the legacy `connected` boolean (the grants filter
`filterMatchesToGranted` still reads the boolean, and HOU-670 keeps
`connected === false` matches discoverable); `status` is the additive superset.

**Direct-adapter search** (`composio.ts` → `composio-search.ts`): the old
connected-scoped short-circuit is GONE (its bug: a connected-Gmail user could not
discover Google Sheets, because a scoped hit `return`ed before global ran). Search
now runs THREE lookups and merges them (scoped first, deduped by action, then
catalog entries):
1. **scoped** query over the user's CONNECTED toolkits (precision; degrades to
   LISTING their actions on a zero-hit everyday phrasing), then
2. **global** query — ALWAYS runs, never short-circuited, so new apps are
   discoverable, then
3. **catalog resolution** — Composio's action full-text scores ~zero for a plain
   app NAME, so the query is resolved against the toolkits catalog
   (`GET /api/v3/toolkits`, cached in-process, 1h TTL, shared in-flight promise)
   to a real slug and surfaced as a **toolkit-level entry** (`action: ""`) even
   when no action scored — so the model always learns the slug to pass
   `request_connection`. Status is derived from the acting user's active
   connections (`connected`/`connectable`; the direct adapter cannot emit
   `blocked`/`unknown`).

**Gateway adapter** (`remote.ts`) reads each `/search` item TOLERANTLY: a valid
`status` passes through verbatim (a future gateway sending `blocked`); an absent
or unrecognized `status` (today's gateway) derives from the `connected` boolean
(`statusFromConnected`). The new field is never required.

**Runtime tool text** (`packages/runtime/src/session/tools/integrations.ts`) is
status-aware: connected actions as before; `connectable` entries name the exact
slug and teach `request_connection`; `blocked` tells the user to ask their admin
and forbids `request_connection`; a genuinely EMPTY result says no such
app/action exists (a real not-found, NOT a policy block).

**Prompt contract — the four speech acts.** `packages/host/src/houston-prompt.ts`
INTEGRATIONS section and its verbatim Rust mirror
`app/src-tauri/src/houston_prompt/integrations.rs` (`PI_INTEGRATIONS_GUIDANCE`,
kept in sync) instruct: connected → use it; connectable → briefly offer +
`request_connection`; blocked → tell the user their admin must enable it (never
imply Houston lacks it, never `request_connection`); unknown/empty → say plainly
no such app is available. An empty result never means an app is unsupported —
trust the reported status.

---

## 2. Grants model — which agents may use which app

### Multiplayer (cloud gateway, C4 + C7)
Per-`(user, agent)` grant set of toolkit slugs, owned by the cloud gateway. The
gateway filters `search` to granted toolkits and refuses `execute` of an ungranted
toolkit. See `cloud/docs/contracts/C4-grants.md` and `C1-integrations-api.md`.

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
write), now consumed by `useOrgSettings` / `useSetOrgSettings`
(`app/src/hooks/queries/use-org-settings.ts`, query key `["org-settings"]` via
`queryKeys.orgSettings()`, wired through `tauriOrg.getSettings`/`setSettings`).
BOTH ceilings render through the SHARED `AllowlistEditor`
(`components/integrations/allowlist-editor.tsx`, i18n-agnostic `copy` prop):
- the **org** editor is the Admin page's **Allowed apps** tab
  (`organization/allowed-integrations-tab.tsx`, Teams owner edits / admin read-only),
  copy `teams:integrations.orgAllowlist.*` (see `teams.md`);
- the **per-agent** editor stays in Agent Settings > **Access** > **Apps**
  (`AgentAllowlistSection`, `tabs/agent-integrations/agent-allowlist-section.tsx`
  — now a thin wrapper feeding `AllowlistEditor` the `teams:integrations.allowlist.*`
  copy, the org-ceiling-narrowed universe, and a connected-apps seed).

The editor's surface is an always-visible two-option choice (`anyLabel` saves
`null`, `pickedLabel` saves an explicit set; choice keys `question` /
`policyHelper` / `anyLabel` / `anyDesc` / `pickedLabel` / `pickedDesc` —
`policyHelper` is the admin-policy helper line noting members still connect their
own accounts) with a per-app allow toggle, not a dense checklist; `readOnly` mode
hides "Add apps" and shows a note. The agent tab surfaces ceiling-blocked apps in
TWO places so policy is never silently invisible: connected-but-blocked apps under
`teams:integrations.notAllowed` (the disallowed section, "Not allowed" badge + an
ask-your-admin line), and NOT-connected blocked apps as **locked rows** in the
browse catalog (see §3, `integrations:locked.*`). Per-agent GRANT toggles are a
SEPARATE concept with TWO lenses — by-app in the global Integrations page's
detail modal and by-agent on the agent tab's "Connected, but off for this agent"
section (§3) — never this ceiling editor. Full client surface:
`knowledge-base/teams.md`.

### Effective access — the one resolver

`effectiveAccess({toolkit, connections, grants, allowlist})`
(`app/src/components/integrations/effective-access.ts`, pure, node-tested) is
THE single answer to "can this agent use this app right now, and if not why":
`usable | notConnected | notGrantedToAgent | blockedByAdmin`, precedence
admin-block > not-connected > not-granted. `grants === null` (unsupported host)
and `allowlist === null` (unrestricted) both read as pass. The agent-tab view
model classifies every connection through it — no surface re-derives the rule.

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

## 2b. Action approvals — the execute-time permission gate

GRANTS answer "which toolkit may this agent touch at all"; APPROVALS answer "may
this specific action call, with these params, run right now". Distinct concepts,
distinct store. An `integration_execute` the user has not pre-blessed pauses the
turn on an approval card instead of firing silently.

**The gate** — `packages/host/src/routes/integrations-sandbox.ts`, in the execute
branch, evaluated in strict PRECEDENCE (skipped wholesale when `deps.actionApprovals`
is unwired, so existing installs/tests execute untouched):

1. **Autopilot header** — an `auto` turn auto-approves. The runtime forwards
   `x-houston-turn-mode: auto` on `/sandbox/integrations/execute` (from the
   turn-mode `AsyncLocalStorage`, `packages/runtime/src/session/turn-mode-context.ts`)
   ONLY on an Autopilot turn; the sandbox HMAC already authenticated the runtime,
   so the header is trusted. Fire-and-forget can never wait on the user.
2. **Always-allow record** — the action slug is on the agent's always list → runs.
3. **One-shot ticket** — a FRESH ticket matching `hashActionParams(action, params)`
   is consumed (single use) → runs. The hash is canonical JSON with recursively
   SORTED keys → sha256 → 16 hex chars, so re-serializing the same call re-hashes
   identically, yet ANY param drift changes the hash → a new card (drift is safe,
   never silently pre-approved).
4. **Else 409** `{error, code:"approval_required", approval:{toolkit, action,
   params, paramsOmitted?, paramsHash}}`. `params` is display-ready
   (`displayParams` returns `{params, omitted}`: strings pass, else JSON; each
   value truncated to 80 chars, at most the first 8 keys). `paramsOmitted` (only
   when > 0) is how many params were dropped past that cap — the card surfaces it
   ("And N more settings") so the user knows the hash covers settings the rows
   don't show. `toolkit` is best-effort (`resolveToolkit`, 409-path only: the
   LONGEST matching GRANTED slug when a record exists, else the LONGEST matching
   slug among the acting user's CONNECTIONS — fault-tolerant, so a `listConnections`
   failure falls through — else the segment before the first `_`; display-only,
   `paramsHash` + `action` are what gate).

The runtime's `integration_execute` classifies the 409 by its `code` (never the
bare status), records an `approval` step on the turn holder (`recordApproval`,
deduped by paramsHash, ids `a1..aN`, LAST in the sequence — approving follows
connecting), and returns non-error queued-pending text so the model ends the turn
cleanly rather than erroring. See `knowledge-base/architecture.md` (interaction
lifecycle).

**The store** — `packages/host/src/integrations/{action-approval-store.ts,
action-approvals.ts, approvals.ts}`, mirroring `FileIntegrationGrantStore`.
`FileActionApprovalStore` persists per-agent JSON at
`<agent>/.houston/action-approvals.json` `{always: string[], tickets:
[{hash, ts}]}` (atomic tmp+rename; missing/corrupt reads as the empty record,
never a crash; removed for free on agent deletion). Both file-backed stores share
the agent-dir path derivation + atomic write via `agent-file.ts`
(`agentDotHoustonFile` + `atomicWriteJson`), not two copies. `LocalActionApprovals` is the
policy over it: `isAlways` / `allowAlways` (case-insensitive dedupe) /
`disallowAlways` (case-insensitive REMOVE for the review UI — read→filter→prune→
put→return next.always, skipping the redundant put on a clean miss like
`consumeTicket`), `addTicket` / `consumeTicket` (consume-once). Tickets have a **15-minute TTL**
(`TICKET_TTL_MS`) and are PRUNED on every read/write path, so a stale ticket never
silently authorizes a later identical call. Every MUTATING op is a read→mutate→
write across awaits, so they are **serialized per agent** through a promise-chain
tail (`chains` map) — two concurrent `consumeTicket`s for one fresh ticket can't
both win (no double-consume / resurrection); `consumeTicket` also skips the
redundant `put` on a clean miss (nothing pruned or removed).

**Pod-side in v1 (NOT gated on gatewayFronted).** Wired in `local/host.ts`
whenever `registry` exists — UNLIKE grants, it does NOT check `!gatewayFronted`, so
a managed cloud pod still enforces the gate pod-side per agent (the gateway does
not own action approvals yet). Per-user approval scoping for Teams is a known
cloud follow-up.

**User routes** — `packages/host/src/routes/action-approvals.ts` (authorize =
`canUseAgent`; dep absent → the handler falls through to 404 → client reads
"unsupported" and degrades without a toast):

- `GET    /v1/agents/:agentId/action-approvals` → `{always}`
- `POST   /v1/agents/:agentId/action-approvals/always`   `{action}` → `{always}`
- `DELETE /v1/agents/:agentId/action-approvals/always`   `{action}` → `{always}` (revoke)
- `POST   /v1/agents/:agentId/action-approvals/tickets`  `{hash}`   → `{ok:true}`

The shared `serve()` core handles all four on BOTH surfaces (the `/v1` wrapper and
the per-agent dispatch), DELETE validating the slug with the same 400 shape as the
POST. The engine-client method is `disallowActionAlways` (DELETE with a JSON body,
no 404-degrade on a mutation), surfaced through `tauriIntegrations.revokeActionAlways`.

The app calls `tickets` on "Allow once", `always` on "Always allow" (the card also
invalidates `queryKeys.actionApprovals(agentId)` on a successful always-allow so the
review list below stays live), and DELETE `always` on the agent tab's **Runs without
asking** review (§3). The model then re-issues the same execute and the gate lets it
through. **The prompt no
longer pre-asks** via `ask_user` for connected-app actions (`houston-prompt.ts` +
the Rust mirror `houston_prompt/base.rs`): "For connected-app actions, do not ask.
Houston shows its own approval card after your turn, so just call
`integration_execute`."

---

## 3. UI map

Gated on `HOST_BUILD` (`app/src/agents/standard-tabs.ts`) — a deterministic build
constant, not the runtime handshake. Absent in the legacy Rust engine build.

**Shared module** — `app/src/components/integrations/` (`index.ts` is the surface;
pure model in `model.ts`/`app-display.ts`, DOM-free and node-tested). Both surfaces
consume it verbatim — no forked copies. Notable exports: `AppDetailDialog`,
`AppRow`, `CatalogLockedSection`, `AgentChips`, `PendingConnectionCallout`,
`IntegrationDisconnectDialog`, the gate/flow hooks below, and pure helpers
`browseCatalog`/`splitByGrant`/`pollConnectionUntilActive`. `browseCatalog` sorts
results ALPHABETICALLY by app name (case-insensitive) after filtering.
`integrationsSupported(caps)` (`model.ts`, `caps.integrations.length > 0`) is the
capability gate the Settings section and the page share.

**Shared connected-apps read-model** — `useConnectedApps`
(`integrations/use-connected-apps.ts`) yields `ActiveAppRow` / `RecoveringAppRow`
plus `editableAgentIds: ReadonlySet<string>` (the per-agent-editability set that
REPLACED the old `canEdit` boolean, computed from `canEditAgentGrants`) over the
pure, node-tested helpers `toolkitAgentIds` / `agentChipsFor` /
`partitionConnections` (`integrations/connected-apps-model.ts`). The global
page's detail modal (the one by-app grants surface) reads it verbatim. The
shared `AllowlistEditor` (`integrations/allowlist-editor.tsx`) is the one
presentational allowlist editor behind BOTH ceilings (§2).

**Always-visible catalog** — the browse catalog is a permanent section, never a
dialog: a brand-new user with zero connections immediately sees the full
~1000-app catalog (`AppCatalogPicker` was deleted long ago). BOTH the global page
and the agent tab now render it through the shared `CatalogPane` +
`CategoryCatalog` (see Personal mode below); an in-progress OAuth renders the
`ConnectWaitingPanel` inline. The old `ConnectMoreAppsSection` / `CatalogBrowser`
pair was DELETED with the agent-tab convergence — `AppCatalogGrid` (search +
category + load-more grid) survives solely inside the allowlist editor.

**Category filter** — `AppCatalogGrid`'s control row is `search flex-1` + a
category combobox (the shared `FilterCombobox`, moved to
`components/shell/filter-combobox.tsx` now three domains use it: ai-hub,
agent-admin models, integrations; category options carry no `mark`). In the
allowlist editor the category is CONTROLLED by the surface so ONE selection also
narrows its Allowed list (pure VIEW filter composing with the text search; "All
categories" resets). The personal global page
uses the SAME `FilterCombobox` (forced `searchable`, so the long category list gets
the in-dropdown search) inside its Integrations tab, with options from
`catalogCategorySlugs` (`browse-model.ts`) — A-Z by label, `UNCATEGORIZED` pinned
last (the dropdown is a lookup-by-name surface, so it orders alphabetically even
though the page's sections order by size). Pure helpers in `integrations/model.ts` (node-tested):
`categoriesOf` (options), `categoryLabel` (slug → "Developer tools"),
`toolkitsInCategory(catalog, category)` (slug set, `null` for "all"), and
`categoryListView` (mirrors the models editor's `allowedListView` — picks a
category-aware empty string, e.g. `integrations:home.connectedNoneInCategory` /
`agentTab.empty.category*` / `teams:integrations.allowlist.allowedEmptyCategory`,
so an empty filtered list never falsely claims the surface has no apps).

**Global page (personal catalog, all modes)** — `app/src/components/integrations-view/`,
top-level view `INTEGRATIONS_VIEW_ID = "integrations-home"` (NOT `"integrations"`, which is
the per-agent tab id — a shared slug would shadow the tab; like `dashboard`/`settings`
a top-level view lives OUTSIDE `STANDARD_TAB_IDS`). The page is ALWAYS the personal
catalog (`IntegrationsReady`), in every mode. The old Teams "policy" identity
(`integrationsPageMode` / `integrations-view-model.ts` / `integrations-policy.tsx`)
was DELETED and the org app-allowlist ceiling moved to the Admin page's **Allowed
integrations** tab (§2, `teams.md`).

- **Nav gating: none.** The sidebar nav item, the `workspace-shell.tsx` render branch,
  and the tour step are UNCONDITIONAL: the page is visible to EVERY member (the old
  `canSeeIntegrationsPage` gate in `org-roles.ts` was removed). A member's org-blocked
  apps still render as **locked rows** on the catalog surfaces (see "Locked browse
  rows" below), never as an allowlist editor.
- **The page** — the flat "plane"
  (`integrations-ready.tsx`, reference: the ChatGPT Plugins page), laid out by the
  generic **`CatalogShell`** (`ui/core/src/components/catalog-shell.tsx`, part of the
  catalog family — reuse it wherever a surface wants "one consolidated Installed
  strip above per-source discovery tabs"). A `PageHeader` hero (title +
  `home.description` subtitle), then the shell:
  (1) the CONSOLIDATED **Installed** strip, OUTSIDE the tabs (identity, not
  discovery — it never changes with the tab): active catalog connections AND custom
  integrations as icon TILES (`InstalledStrip`; custom tiles get letter avatars). A
  catalog tile opens `AppDetailDialog`; a custom tile jumps to the Custom tab. Its
  header carries a `CatalogCount` chip (`installedCount`).
  (2) two discovery tabs (`home.tabs.*`, each trigger with a `CatalogCount` badge):
  **Integrations** (`catalog-pane.tsx`: a controls row — `CatalogSearchField flex-1`
  + the searchable A-Z `FilterCombobox` — then `RecoveryRow`s and the grouped
  `CategoryCatalog`; count = connectable apps) and **Custom integrations**
  (`CustomIntegrationsSection variant="tab"`; count = the custom list). Search and
  category state are LOCAL to each tab; the connect flow lives on the PAGE so
  switching tabs never kills an in-flight OAuth poll. When the host doesn't serve
  custom integrations (`useCustomIntegrations` → `null`) the shell has ONE tab and
  drops the tab chrome entirely.
  `CategoryCatalog` groups the connectable catalog (connected toolkits EXCLUDED) by
  primary category into flat two-column `PlaneAppRow`s, sections ordered by size via
  the pure `groupCatalogByCategory` (`browse-model.ts`); each section header carries
  its count chip (`CatalogSectionHeader` `count` — the chevron accent is GONE from
  the section-header idiom). Each row is the split `CatalogRow`
  (`ui/core/src/components/catalog-row.tsx`): the row BODY opens the app's
  "more info" modal (`app-info-dialog.tsx` over the generic `CatalogDetailDialog` —
  art, name, category `Badge` chips, the FULL description, a Connect CTA), while
  the GHOST round `+` at the right edge (`CatalogAddButton`: full-ink icon,
  transparent at rest, hover fills the circle with the elevated `input` surface —
  white in light mode — against the row's `hover` wash; spins while THIS app
  connects, disables while another owns the flow — the body stays clickable) is
  the ONLY row-level connect. Copy: `home.connect` /
  `home.connectApp`. Disconnect is scope `everywhere` and names affected
  agents. This page is THE one by-app grants surface: a connected app's
  `AppDetailDialog` (opened from the Installed strip tile) DOES pass
  `onToggleAgent`, so it renders the per-agent grant toggles (a `Switch` per
  agent via `useAgentGrantToggle`, each row editable per `editableAgentIds`)
  beside reconnect + disconnect. The detail modal + disconnect dialog + their
  grant wiring are extracted into `connected-app-dialogs.tsx` (`ConnectedAppDialogs`)
  so `integrations-ready.tsx` stays within the file-size limit; the page owns the
  selection + connect flow and hands them in. The presentational pieces
  live in `components/integrations-view/` (`catalog-pane`, `catalog-search-field`,
  `installed-strip`, `plane-app-row`, `category-catalog`, `recovery-row`,
  `connected-app-dialogs`); the old two-column `ConnectedAppsList` card grid was
  DELETED with the Settings fold and the dropdown-filtered `ConnectMoreAppsSection`
  (agent tab) is gone too.
  The **Custom integrations** tab shares the flat row language
  (`CustomIntegrationRow`: leading letter avatar, transparent-at-rest
  `hover:bg-hover`). Its controls row is its own search (`custom.searchPlaceholder`,
  filtering via the pure `filterCustomIntegrations`, node-tested) + the Add button;
  with zero items and no draft chat in flight it collapses to a pure EMPTY STATE
  (`custom-empty-state.tsx`: `custom.emptyTitle` + `custom.description` + a filled
  Add CTA — the one accent of an empty surface). The standalone `variant="section"`
  (embedded by the page's non-ready states) keeps its own heading + count chip and
  the `custom.empty` paragraph.

**Settings > Connected accounts — REMOVED entirely.** The standalone settings
section is GONE (`connected-accounts*.tsx` deleted, the id `"connectedAccounts"`
removed from `SETTINGS_SECTION_IDS`, so `parseSettingsSection` now REJECTS it and
a stale deep-link can never land), and Settings carries NO integrations row at
all — a shortcut row duplicating the sidebar's Integrations nav was pure chrome
(Felipe's call). The global Integrations page is the ONE by-app lens —
connection status + which agents can use each app — reached only via its sidebar
nav. The `settings:connectedAccounts.*` copy block, the `nav.connectedAccounts` /
`index.rows.connectedAccounts` / `index.values.appsCount` row keys, and the
`home.usedByNone`/`home.usedByAll` chip keys were all deleted. The grants surface
itself lives in the page's `AppDetailDialog` (per-agent `Switch`es via
`useAgentGrantToggle`, `app/src/hooks/queries/use-agent-grant-toggle.ts`, each row
editable per `editableAgentIds` from `canEditAgentGrants`) — see the global page
block above.

**Agent tab (the by-agent lens)** — `app/src/components/tabs/agent-integrations/`
(`integrations-tab.tsx` re-exports the orchestrator). The tab body is the SAME
catalog layout as the global Integrations page, minus the page header (the tab
label already says Integrations): `agent-integrations-body.tsx` renders the shared
`CatalogShell` — the consolidated Installed strip (the agent's usable ACTIVE apps
+ the user's custom integrations; a tile opens `AppDetailDialog`, whose Disconnect
confirms via `IntegrationDisconnectDialog` scope `everywhere`; a custom tile jumps
to the Custom tab) above the Integrations / Custom integrations tabs. The catalog
tab is the SHARED `CatalogPane` (`integrations-view/catalog-pane.tsx`: search +
A-Z searchable category combobox, recovery rows, the grouped `CategoryCatalog`),
generalized to plain props (`catalog`/`connections`/`recovering`/`allowlist`/
`readOnly`/`children`) so both surfaces consume it verbatim — the agent tab passes
`AgentCatalogSections` as its `children` and `readOnly` (`!canEditAgentGrants`)
to strip the recovery rows' actions for Teams viewers. The `grants`-mode view is
`{activeRows, disallowedRows, availableRows}`, every connection classified through
the ONE `effectiveAccess` resolver (§2): active rows split into strip tiles vs
recovery rows by connection status; `availableRows` (connected on the account but
NOT granted to this agent, `active` status only — pending/errored orphans are
recovered from the global page) render as the **"Connected, but off for this
agent"** section (`agent-ungranted-apps-section.tsx`,
`integrations:agentTab.offForAgent.*`): `AppRow`s with a trailing `Switch` that
grants via `useAgentGrantMutation` (optimistic — the row migrates to the Installed
strip); viewers without `canEditAgentGrants` see the rows without the Switch, so
the state is never invisible. The disallowed section renders below it, then the
**"Runs without asking"** review (`agent-approved-actions-section.tsx`,
`integrations:agentTab.runsWithoutAsking.*`) — the ONE surface that reviews and
REVOKES the action-approval always-list (§2b), rendered by `AgentCatalogSections`
below the disallowed section in BOTH grants and degraded modes. It self-gates on
its own `useAgentActionApprovals(agentId, enabled)` query (`enabled` =
`integrationsSupported`, the engine-client GET degrades 404→`[]`) and renders
nothing while the list is empty. Each row resolves the bare action slug to its app
via the pure `toolkitOfActionSlug(action, catalogSlugs)` (longest catalog-slug
prefix wins over the first segment, mirroring the host's `resolveToolkit`;
node-tested in `app/tests/approved-actions-model.test.ts`) fed into
`useIntegrationAppDisplay` for logo+name, with the HUMANIZED action
(`humanizeActionSlug`, never the raw slug) as the row text and a visible outline
**Remove** (not hover-gated) firing `useRevokeActionApproval(agentId)` (optimistic
remove + targeted rollback + invalidate on settle, no `onError` toast). `degraded`
mode (grants `null`) treats all connected apps as usable. Recovery **Remove** DISCONNECTS in both modes.
Connect still auto-grants to this agent (`useConnectFlow` `autoGrant`). The tab
count chip excludes locked apps. All lifted view state (tab/search/category/modals)
lives in the body, remounted per agent via `key={agent.id}`. The bottom link
`integrations:agentTab.manageAll` ("Manage all integrations") ALWAYS routes to the global
Integrations page (visible to every member now, so the old `canSeeIntegrationsPage`
branch to Settings > Connected accounts is gone).
The old `ConnectMoreAppsSection` / `CatalogBrowser` / per-agent apps grid
(`agent-apps-body` / `agent-apps-section` / `agent-app-row`) were DELETED with this
convergence; `AppCatalogGrid` survives solely for the allowlist editor.

**Locked browse rows (Teams only).** On a Teams host with a real effective
allowlist, the browse catalog no longer FILTERS blocked apps out (which read as
"Houston doesn't support X"); instead the surface passes the effective
`allowlist` down through `CatalogPane` → `CategoryCatalog`, which calls the pure
`browseCatalogView` (`integrations/browse-model.ts`) to split the browse set into
`connectable` (inside the ceiling, grouped into the category sections) and
`locked` (outside it). BOTH browse surfaces now feed it: the per-agent tab passes the
agent's effective `allowlist`, and the **global Integrations page** now fetches the org
app ceiling (`useOrgSettings(teamsEnabled)`, member-readable `GET /org/settings`) and
passes that `allowlist` into `CatalogPane`, so org-blocked apps render in the SAME locked
pipeline for EVERY member, search included. Off Teams the page passes `allowlist === null`
(unchanged). Locked apps render via `CatalogLockedSection`: read-only
`AppRow`s with a `Lock` trailing icon and the `integrations:locked.askAdmin`
subtitle ("Ask your admin to enable {app}", visible at rest — no hover gating),
under a muted `locked.heading` ("Turned off in your workspace") with a `CatalogCount`
count badge and a `locked.subtitle` line ("Your admin picked which apps can be used
here..."), capped at `LOCKED_PREVIEW_CAP` (8) with a reworded `locked.more_*` "+N more"
count line so a tiny allowlist over the ~1000-app catalog can't bury the connectable
apps. A member SEARCHING for a blocked app finds its locked row (search + category filter
before the partition), never emptiness. `allowlist === null` (single-player, or Teams
with no ceiling) → `locked` always empty → no locks ever; the manager's allowlist editor
(`AppCatalogGrid`) is unchanged.

**Role-aware signposting (Part B).** A locked row is not just informational for a viewer
who can LIFT the ceiling: `CatalogLockedSection` (and the connected-app `AgentDisallowedAppsSection`)
take an optional `onEnable?: PermissionsFix` resolver (`integrations/blocked-ceiling.ts`).
When it returns a thunk for a slug, the ask-your-admin line is REPLACED by an
`EnableInPermissionsButton` ("Enable it in Permissions", `integrations:locked.enableInPermissions`
/ `teams:integrations.notAllowed.enableInPermissions`) that deep-links into the Admin
Permissions area (`setViewMode(ORGANIZATION_VIEW_ID)` + an org-nav request). WHICH ceiling
decides the destination and the authority: `blockingCeiling(slug, {orgAllowedToolkits, agentAllowedToolkits})`
returns `"org"` (slug outside the org ceiling → owner-only, deep-links to the org Allowed
apps section via `requestTab("allowedIntegrations")`) or `"agent"` (inside org, outside the
agent ceiling → the agent's manager, deep-links to this agent's Admin drill-in via
`requestAgentDetail`). The resolver (`resolvePermissionsFix`) returns `undefined` — member
copy, unchanged — whenever the viewer lacks the authority (`canEditOrgSettings` for org,
`isAgentManager && canSeeMembers` for agent; the `canSeeMembers` guard keeps a non-admin
manager, who can't open the Admin dashboard, from getting a dead link). The leaf sections
stay presentational (props only, no store imports); the resolver is BUILT at the surfaces
that hold the policy data — the global page (`integrations-ready.tsx`, org ceiling only,
no agent context) and the per-agent tab (`agent-integrations-tab.tsx`, per-slug org-vs-agent
attribution) — and threaded down through `CatalogPane`/`CategoryCatalog` (`lockedFix`) and
`AgentCatalogSections` (`permissionsFix`). Pure logic is node-tested in `app/tests/blocked-ceiling.test.ts`.

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

**Agent-initiated connect (in-chat).** When an agent needs an unconnected app it
calls the integration-gated `request_connection` tool (never writes a link). That
records a `{kind:"connect", toolkit, reason?}` pending interaction which rides the
turn's clean `done` frame and settles the board card to `needs_you`; the pending
interaction floats a `ChatInteractionCard` stepper ABOVE the composer, whose
connect step is `ChatConnectInteractionCard`. Every step (question, sign-in,
connect, approval) composes ONE shared modal shell — `InteractionModal` + `InteractionModalTitle`
in `ui/chat` (reference "Coworker card" look, inventory v19) — that owns the
surface, the HEADER row (title left; `‹ N of M ›` pager + dismiss X top-right),
the body, and a right-aligned FOOTER row. The connect step's `(icon) NAME`
identity lockup (AppLogo `sm` beside the integration NAME at REGULAR weight — the
sign-in step seats the Houston helmet + "Houston" in the same slot) is the modal
TITLE, IN the header beside the pager/X; the body is a two-field block (the
agent's reason in foreground tone over a muted app-description / sign-in-explainer
line; the connected state swaps it for a calm check + "Connected"). The signin/
connect body renders its OWN `InteractionModal`, wired with the `StepChrome`
(`{ pager, onDismiss, dismissLabel, disabled }`) the stepper hands it, so ui/chat
stays auth/Composio-unaware while the whole family shares one shell (there is no
more headerless-body + `InteractionFooter` split). Weight is restrained: color
tone carries the hierarchy, so titles and labels are REGULAR, never bold. The
footer is the unified "Not now" + Esc hint beside the single filled "Connect"
pill (with a return-key glyph); Enter fires Connect, Esc declines (a capture-phase
handler pre-empting the global Escape-closes-panel shortcut). Navigation is the
header pager for every kind (NO card-inside-a-card, NO body nav button). Every
step kind is SKIPPABLE, and a SKIPPED signin/connect step is RECONSIDERABLE:
walking Back onto it (the pager) reoffers its filled CTA, so the user can connect
/ sign in after all (a COMPLETED step, which can't re-fire completion, shows the
calm connected state with no footer — the pager's forward chevron is onward). A
skip is a recorded fact the completed reply states ("Skipped connecting {app}." /
"Skipped signing in.", `chat:interaction.skipped*` keys) so the agent hears the
decline instead of re-requesting — UNLESS the step was reconsidered, in which
case the reply derives each step's FINAL outcome and reports "Connected {app}."
instead (the panel keys a per-step outcome map read at completion via
`finalConnectNames`; ui/chat's `StepFooterApi` is `{ revisited, onSkip }` — the
body reads `revisited` to suppress its frontier-only "Not now" and, once
completed, its CTA). It shares the connect flow above with the inline link card
through one hook (`app/src/components/use-integration-connect.tsx`); only the
presentation forks — the inline `#houston_toolkit` renderer stays a `RowCard`
badge, the stepper draws the shared `InteractionModal` (identity in the header,
CTA in the footer). Both render the logo
through the shared `AppLogo` (the hook holds the favicon-guess fallback until
the toolkits catalog settles, and `AppLogo`'s failure latch is keyed to the
failing URL — a pre-catalog 404 once permanently shadowed the real Composio
logo in production). Both auto-continue the conversation once OAuth lands (or
the app is already connected). The old `#houston_toolkit=` markdown-link
connect hack is GONE from the prompt and tool guidance — the app's legacy
link-card renderer survives only to render old transcripts. Full lifecycle →
`knowledge-base/architecture.md`.

**Action-approval card (in-chat).** When the host gates an
`integration_execute` (§2b), the runtime queues an `approval` step and the same
stepper renders `ChatApprovalInteractionCard`
(`app/src/components/chat-approval-interaction-card.tsx`) through ui/chat's
`renderApproval` prop — its own `InteractionModal` wired with the `StepChrome`
(pager + dismiss X) the stepper hands it, so ui/chat stays Composio-unaware. It
resolves the toolkit to a logo + name for the '(icon) NAME' title WITHOUT any
connect side effect (no OAuth, no auto-continue — reusing `useIntegrationStatus`
/ `useIntegrationToolkits` + the shared `AppLogo`), asks JUST "Allow {app} to
{action}?" (`humanizeActionSlug`) — the tool's raw params ride the wire but are
NEVER rendered (non-technical audience; the approval still covers the exact
call via `paramsHash`) —
and offers three FOOTER decisions — Always allow (outline, LEFT) / Deny (outline,
Esc) / Allow once (filled, Enter). `onDecision` writes the store (allow-once →
`tickets` POST, always-allow → `always` POST) then advances. The composed reply
(`app/src/lib/interaction-reply.ts`) is TWO-FACED: the flat BODY the MODEL reads
names the RAW action slug via `approvedLine` / `deniedLine` (so it re-issues the
EXACT call — `approvedLine` also says "Use exactly the same parameters as before"
to guard against param drift breaking the one-shot ticket), while the VISIBLE
transcript payload a non-technical user reads names the HUMANIZED app + action via
`approvedLineDisplay` / `deniedLineDisplay` ("Allowed Gmail to send draft.", never
the slug). `finalApprovalNames` keeps one decision per step id (walked-back
re-decides collapse to the LAST) and carries both the slug and the humanized
`display` the panel computes (`humanizeActionSlug` + `prettifyToolkit`). A
revisited decided step shows a calm check + "Allowed" (or muted "Denied") with no
footer. The three step cards (approval/connect/signin) share ONE capture-phase
Enter/Esc hook (`use-interaction-step-keys.ts`); the approval card's read-only
app-identity resolution is `use-integration-app-display.ts`.

**No silent failures.** All engine mutations route through `call()`
(`app/src/lib/tauri.ts`), which toasts + reports once, so the integration hooks
carry NO `onError` (a second toast would double up). See `useAgentGrantMutation`.

---

## 4. Custom integrations (HOU-550) — user-added APIs & MCP servers

Users connect services the Composio catalog does not offer. The engine is the
embedded **executor SDK** (`@executor-js/sdk` + `plugin-openapi` + `plugin-mcp`,
MIT, pinned EXACT — pre-1.0), wrapped entirely behind the same
`IntegrationProvider` port as provider id **`custom`**
(`packages/host/src/integrations/custom/`). Nothing executor-shaped leaks past
the adapter, and the packages' broken root type entries mean imports go through
the `/core` subpaths (see executor-host.ts's comment).

**Key-free and always on.** `buildLocalHost` registers the custom provider
unconditionally (beside Remote/Composio when configured) — definitions and
secrets live on THIS host's disk, so an install with no Composio key, or a
signed-out desktop, still serves it. `capabilities.integrations` therefore
always contains `"custom"`.

**Houston owns persistence; the executor is a compiled view.**
`custom-integrations.json` holds definitions next to credentials.json. On
local/self-host, `custom-integration-secrets.json` is the 0600 secret store; on
managed cloud, `RemoteCustomSecretStore` sends values over the agent's
host-token-authenticated gateway route into GCP Secret Manager, and no value is
written to the agent-data store. At the first managed boot after upgrade, the
host hydrates the legacy file, uploads every entry, and removes it only after
all writes succeed; the following sync deletes the old GCS object. A partial
migration leaves the whole file intact for safe retry.

`CustomExecutorHost` lazily builds one in-memory executor and rehydrates every
definition into it (addSpec/addServer + an org/`default` connection per def); a
definition that fails to compile degrades to state `error` for itself only.
Secrets reach requests via a Houston `CredentialProvider` (`secrets.ts`)
resolved lazily — the executor never copies values.

**Definition shape** (discriminated union, `types.ts`): `openapi` (spec
url|blob, baseUrl?) or `mcp` (remote endpoint, headers?), plus
`auth: "none" | "credential"` and an optional stored `credential`
{template, secretIds}. State per def: `active` (toolCount) / `pending` (needs a
key; authMethods carry the collectible fields — v1 is ONE `token` variable per
method) / `error`.

**Actions are executor addresses.** A custom ToolMatch's `action` is
`tools.<integration>.<owner>.<connection>.<tool>`; `toolkit` is the integration
slug. Grants: `actionInToolkit` maps a `tools.`-prefixed action to its
integration segment (exact match), so per-agent grant records hold plain custom
slugs beside Composio ones and materialization picks up custom connections
automatically.

**Sandbox proxy fans out.** `/sandbox/integrations/search` with no explicit
provider queries ALL registered providers and merges (a failing provider never
hides another's results; an all-empty merge rethrows a SigninRequired if one
occurred). Execute routes by action shape (`providerForAction`: `tools.` →
custom). Execute is capped at 120s so a hung upstream can never wedge the turn.

**Setup is agent-driven (chat), never a form.** The runtime ships three gated
tools (`packages/runtime/src/session/tools/custom-integrations.ts` +
`request-credential.ts`): `custom_integration_detect` (classify a pasted URL —
`integrations.detect` + MCP probe), `custom_integration_add` (register + compile;
management routes: `/sandbox/integrations/custom/{detect,add}`, HMAC-authed),
and `request_credential` — records a `{kind:"credential", toolkit, reason?}`
interaction step (protocol `interaction.ts`, ids `k1..kN`, auto-excluded from
Autopilot) that replaces the composer with a SECURE key-entry card. The secret
travels UI → `POST /v1/integrations/custom/definitions/:slug/credential` →
validate (`connections.validate`, fail-open on `unknown`) → secret store →
connection rewire. It NEVER enters the transcript; the prompt (houston-prompt.ts
+ the Rust mirror) forbids asking for keys in chat.

**User routes** (`routes/custom-integrations.ts`, mounted BEFORE the generic
`/v1/integrations/:provider/*` catch-all): GET/DELETE
`/v1/integrations/custom/definitions[/:slug]` + the credential POST. Errors
carry stable `code`s (`not_found`, `duplicate_slug`, `credential_invalid`,
`compile_failed`…). Mutations emit `CustomIntegrationsChanged` (protocol
events.ts) → query invalidation.

**UI**: a "Custom integrations" section on the global Integrations page (between
Connected apps and the catalog) listing defs with kind badge/status/delete plus
an "Add custom integration" button that opens a NEW CHAT seeded with the
interview prompt; the in-chat credential card
(`app/src/components/chat-credential-interaction-card.tsx`) is a first-class
citizen of the `InteractionModal` shell, mirroring the connect card: a key-glyph
+ integration-name header, the reason line over the shared `CustomCredentialForm`
(externalized submit via `formId`/`hideSubmit`/`onReadyChange`), and a footer
with a "Save key" CTA beside the unified "Skip" (Esc). A saved key auto-continues;
a SKIPPED key is a recorded fact the reply states ("Skipped adding the {name}
key.", `chat:credential.skippedLine`; `finalCredentialNames` mirrors
`finalConnectNames`) so the agent stops waiting. Hidden when the host 404s the
definitions route (engine-client returns `null`, same convention as grants).

**Cloud custody**: definitions remain agent data, while values are agent-scoped
Secret Manager secrets. Engine pods have no GCP IAM; only the gateway can
resolve the deterministic non-PII resource id. The cloud web client's global
custom-management route still depends on gateway proxy support; custody is safe
regardless of whether that UI surface is enabled. Rollout and rollback are
COUPLED: a gateway without Secret Manager custody (old image, or
`GW_SECRET_MANAGER_PROJECT` unset outside dev) answers the pod custody routes
401, so a new-image managed pod fails every custom-secret read. Rolling the
gateway's custody flag back requires pinning the engine image back in the same
step. The Anthropic credential is NOT part of this custody: the gateway's
central store is its single custodian and rotator (see
anthropic-credentials.md) — pods never hold or restore its refresh token.

---

## 5. Triggers — event-driven routines (C9)

A routine gets exactly one wake mechanism: a cron `schedule` OR a `trigger`
binding (a Composio event, e.g. "a new Gmail message arrived"). Everything
downstream of the wake — run records, chat mode, provider pins, Autopilot,
acting-as the creator — is identical to a cron routine. Full design +
cross-repo contract: `cloud/docs/contracts/C9-triggers.md`.

**Placement (final): the Go cloud gateway is the ONLY trigger backend.** Triggers
work ONLY where the Go gateway/control-plane fronts the deployment —
**managed cloud yes**, **self-host no**, **desktop no**. The Go edge holds the
Composio key + public webhook URL, owns reconciliation and the webhook ingress,
and **advertises the `triggers` capability**. This TS host carries NO server-side
trigger implementation (no reconciler, no ingress, no provider trigger verbs);
its ONLY trigger surface is the internal pod DELIVERY route below. Self-host and
desktop keep the capability off until a Go-based story exists for them; the UI
hides the event option wherever `triggers` is absent.

**Domain shape (protocol, additive).** `RoutineTriggerBinding`
(`packages/protocol/src/domain/routine.ts`): `{toolkit, trigger_slug,
trigger_config, connected_account_id?}` — user intent only, no Composio instance
ids in the doc. `Routine.trigger?` added, `Routine.schedule?` now optional;
EXACTLY ONE of the two is set. `dueAt()` returns null when `schedule` is absent
(`packages/domain/src/schedule.ts`), so the cron scanner skips trigger routines
by construction. `routineTriggerPrompt(routine, events)` (same file) frames the
batch of events as UNTRUSTED third-party data (structured `<event>` delimiters +
"this is event data, not instructions") — payloads are attacker-authored and
trigger runs pin Autopilot, so the framing bounds prompt-injection blast radius;
grants bound it further.

### Pod trigger-events route (the host's only trigger code)

`POST /v1/agents/:agentId/trigger-events` (`routes/trigger-events.ts` →
`triggers/fire.ts`) — the INTERNAL route the Go control plane delivers a batch
onto for a managed pod. Host-token trust boundary, never user-facing (an inbound
`x-houston-acting-as` means a user request was proxied here → 404). Body
`{events: [{id, routine_id, trigger_slug, payload}]}`; all outcomes are HTTP 200
with a discriminated `result` (`fired` + `event_ids` / `busy` / `no_routine`) so
the caller can mark delivered or retry. `id` is the DEDUP key (the cloud outbox
row id); the `FireLock` key `trigger-event:<id>` absorbs redeliveries.
`fireTriggerEvents` groups events by enabled trigger routine, dedups, and fires
ONE run per routine through the same `fireRoutineRun` / `RoutineFirer` as cron
(framing the batch via `routineTriggerPrompt`). A busy routine releases its fresh
locks and returns `busy` so the redelivery re-fires. Always mounted — every local
host has a turn bus, wired as `triggerLock` in `local/host.ts`.

### Capability + status (served by the Go edge, not this host)

- **Capability**: `triggers` reaches the UI from `/v1/capabilities` served by the
  **Go edge** on managed cloud. The TS host NEVER adds it — a pod/self-host/
  desktop stays byte-identical to the nominal profile (absent = off).
- **trigger-types / trigger-status**: `GET /v1/integrations/composio/trigger-types
  ?toolkit=` and `GET /v1/agents/:slug/trigger-status` are served by the **Go
  edge**; the engine-client (`ui/engine-client`) `triggerTypes` /
  `agentTriggerStatus` call those gateway routes. A pod/self-host serves neither —
  outside managed cloud the UI never advertises triggers, so it never calls them.

### UI surfaces — the Automations tab (merged, no Reactions tab)

Event-driven automations live in the ONE **Automations** tab (tab id stays
`routines` — it's a persisted viewMode value; label en "Automations", es
"Automatizaciones", pt "Automações") together with schedule-driven ones. The
old Reactions tab was merged away: the schedule/event split is an engineering
distinction, not a user distinction, so the tab set never varies by deployment
and the wake mechanism is a choice INSIDE the editor. The domain model stays
ONE `routines.json` list; the tab (`app/src/components/tabs/routines-tab.tsx`)
renders it unfiltered, with per-row sentence summaries ("Runs every day at
9:00" vs "Wakes on an event in Gmail"). The list sits on the shared catalog
grammar (inventory v24/v25): flat hover-fill rows, Active / Paused sections
with `CatalogSectionHeader` count chips, a pure empty state (title +
description + one filled CTA).

`RoutineRowEdit` owns the wake choice: a plain-language "When should this
happen?" toggle ("On a schedule" / "When something happens in an app"),
rendered only when `allowEventWake` (from `capabilities.triggers`) AND the
app-injected trigger editor are present; otherwise it is schedule-only with no
choice shown. An existing event routine opens on its event side; switching to
schedule on save clears the trigger (`routineUpdateFromPatch` sends
`trigger: null`, preserving the server's exactly-one invariant). `ui/` cannot
reach app data, so the app injects the editor as a slot —
`RoutineTriggerEditor` (`app/src/components/tabs/routine-trigger-editor.tsx`)
owns the pick-an-app → pick-an-event → fill-the-details flow over
`TriggerPicker` / `TriggerConfigForm` (the config form is generated from the
trigger type's JSON-schema); usable apps are scoped to the agent's granted
toolkits (`use-usable-toolkits`). The live `TriggerStatusBadge` renders above
it; a `paused_disconnected` routine offers one-click reconnect. Creation:
"With AI" (ONE setup-chat kickoff, `routine-chat-prompts.ts`, which offers the
event wake only when `capabilities.triggers` is on) or "Manually" (inline
draft card, starts on the schedule side). Setup chats all carry
`ROUTINE_SETUP_AGENT_MODE`; the legacy `REACTION_SETUP_AGENT_MODE =
"houston:reaction-setup"` sentinel is recognized forever (pre-merge chats are
user data) but never written. Read queries: `useTriggerTypes` /
trigger-status in `app/src/hooks/queries/use-triggers.ts`, gated on the
`triggers` capability so a desktop build never fetches.
