# Integrations (Composio platform mode + custom integrations)

How Houston connects third-party apps (Gmail, Slack, …) so agents can act on
them. TWO providers live behind the port today: **Composio** (the hosted
catalog) and **`custom`** (user-added OpenAPI/MCP sources, HOU-550 — §4). This
doc covers the host architecture, the app-usage policy (allowlist ceilings; the
per-agent grants layer was removed), the UI map, and the custom-integrations
engine.

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
  `POST /api/v3.1/connected_accounts/link`. Every `/tools` read and execute pins
  Composio's TOOL VERSION to `latest` (`TOOL_VERSION`): the v3 endpoints default
  to the frozen base snapshot `00000000_00`, whose connector code ages until the
  third-party API retires what it depends on (prod: LinkedIn create-post 426
  NONEXISTENT_VERSION from a retired `Linkedin-Version` header) and which hides
  every tool added since the snapshot. Search and execute pin TOGETHER so the
  schema the model read and the connector that runs are the same version.
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
- `blocked` — a real toolkit outside this agent's allowlist (turned OFF in the
  agent's Permissions tab): tell the user it can be switched on there — whoever
  manages the agent can do it, otherwise they ask whoever does — never imply
  Houston lacks it, never `request_connection`. Rendered `, TURNED OFF` in the tool
  list. **`blocked` is produced solely by the closed cloud gateway** (Teams v2,
  C7), which annotates its `/search` items with `status: "blocked"` for allowlist-
  excluded toolkits and strips their `inputParams`; nothing in THIS repo emits it
  (the direct adapter only knows `connected`/`connectable`). (Distinct from the
  browse-catalog **locked rows** in §3: those are a CLIENT-SIDE intersection of the
  effective allowlist against the ~1000-app catalog, a visible-UI affordance, not
  this agent-facing search-status enum. The locked rows never set or read `blocked`.)
- `unknown` — not a recognized toolkit (reserved; today an unrecognized query is
  simply the EMPTY result).

`connected` is kept alongside the legacy `connected` boolean (HOU-670 keeps
`connected === false` matches discoverable for the in-chat connect card);
`status` is the additive superset.

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
slug and teach `request_connection`; `blocked` (rendered `, TURNED OFF`) tells the
user to switch the app on in the agent's Permissions tab and forbids
`request_connection`; a genuinely EMPTY result says no such app/action exists (a
real not-found, NOT a policy block).

**Execute-time allowlist refusal.** The gateway 403s an out-of-allowlist
`execute` with `{code:"toolkit_not_allowed"}` (the sole execute gate, C7). The
sandbox proxy relays that body verbatim (`integrationUpstreamErrorFromResponse` →
`IntegrationUpstreamError` → `relayIntegrationUpstreamError`, preserving the JSON
`code`), so `integration_execute` classifies it by its stable `code`, never the
bare 403, and RETURNS
guidance (the app is turned off for this agent; tell the user to enable it in the
Permissions tab; do not retry until they confirm), never a thrown/raw error.
Marked `details.appTurnedOff`.

**Prompt contract — the four speech acts.** `packages/host/src/houston-prompt.ts`
INTEGRATIONS section and its verbatim Rust mirror
`app/src-tauri/src/houston_prompt/integrations.rs` (`PI_INTEGRATIONS_GUIDANCE`,
kept in sync) instruct: connected → use it; connectable → briefly offer +
`request_connection`; blocked → tell the user it can be switched on in this
agent's Permissions tab, someone who manages the agent can do it (never imply
Houston lacks it, never `request_connection`); unknown/empty → say plainly no such
app is available. An empty result never means an app is unsupported — trust the
reported status.

---

## 2. App-usage policy — which agents may use which app

**Usable = connection ∩ effective allowlist.** An agent may use an app when the
acting user has an ACTIVE connection to it AND the toolkit sits inside the agent's
effective allowlist ceiling. There is NO separate per-`(user, agent)` GRANTS
layer any more — the entire grants system (app UI, engine-client + adapters, host
routes + file/memory stores, and the sandbox search-filter / execute 403) was
removed. This open host neither reads nor enforces grants: the sandbox proxy runs
`search`/`execute` UNFILTERED. Ceilings are the only policy.

### Enforcement lives in the cloud gateway (pending its own change)
Policy enforcement is the CLOSED cloud gateway's job, not this repo. The gateway
narrows `search` and refuses `execute` outside the effective allowlist; its own
legacy grant-enforcement code is being retired in a SEPARATE cloud change
(cross-ref `cloud/docs/contracts/C4-grants.md` + `C1-integrations-api.md`).
Desktop/self-host run this open host with NO server-side policy layer — an
install with a connection can use the app.

### The per-agent allowlist ceiling is the only policy (Teams v2, C7)
> **Org-wide ceiling REMOVED (2026-07-16, Felipe: overengineering).** The
> `org_settings` ceiling, the `OrgSettings` wire type + `getOrgSettings`/
> `setOrgSettings`/`useOrgSettings` chain, and `AgentSettings.orgAllowedToolkits`
> are gone. Policy is managed ONLY per agent; a new agent defaults to every app.
> The gateway-side retirement rides a sibling `cloud` PR.

One ceiling decides usability: the per-**agent** ceiling (`agent_settings`):

```
effectiveAllowlist = agentCeiling ?? ALL
```

`null` = unrestricted (ALL), `[]` = none. When the ceiling **shrinks**, the gateway
prunes now-disallowed toolkits from live connections so revocation takes effect
immediately. A per-agent **connect carries the agent slug**: the gateway checks
the toolkit against the allowlist on a successful OAuth (see
`connectIntegration(provider, toolkit, agent?)`).

**Client + UI.** `getAgentSettings` / `setAgentSettings` read/replace the agent
ceiling (`allowedToolkits` — the whole effective allowlist — plus the caller's
effective `access`; manager-only write). The ceiling renders through the SHARED
`AllowlistEditor` (`components/integrations/allowlist-editor.tsx`, i18n-agnostic
`copy` prop):
- the **per-agent** editor is `AgentAllowlistSection`
  (`tabs/agent-integrations/agent-allowlist-section.tsx` — a thin wrapper feeding
  `AllowlistEditor` the `teams:integrations.allowlist.*` copy, the WHOLE catalog as the
  selectable universe, and a connected-apps seed). It is NO LONGER mounted in Agent
  Settings; the Permissions view mounts it (via `AgentAdminIntegrations`,
  `AgentAdminModel`) inside a per-agent drill-in. Agent Settings > **Access** now carries
  only "people with access" (`agentAdminCards`' access card is `["people"]`); the apps +
  models ceiling rows and their `agent-admin-{integrations,model}` mounts left that tab.

The editor's surface is an always-visible two-option choice (`anyLabel` saves
`null`, `pickedLabel` saves an explicit set; choice keys `question` /
`policyHelper` / `anyLabel` / `anyDesc` / `pickedLabel` / `pickedDesc` —
`policyHelper` is the admin-policy helper line noting members still connect their
own accounts) with a per-app allow toggle, not a dense checklist; `readOnly` mode
hides "Add apps" and shows a note. The agent tab surfaces ceiling-blocked apps in
TWO places so policy is never silently invisible: connected-but-blocked apps under
`teams:integrations.notAllowed` (the disallowed section, "Not allowed" badge + an
ask-your-admin line), and NOT-connected blocked apps as **locked rows** in the
browse catalog (see §3, `integrations:locked.*`). Per-agent GRANT toggles are GONE
from the client: the old by-app lens (the global page detail modal) and by-agent
lens (the agent tab's "Connected, but off for this agent" section) were both removed
along with the whole app-side grants layer. Full client surface:
`knowledge-base/teams.md`.

### Effective access — the one resolver

`effectiveAccess({toolkit, connections, allowlist})`
(`app/src/components/integrations/effective-access.ts`, pure, node-tested) is
THE single answer to "can this agent use this app right now, and if not why":
`usable | notConnected | blockedByAdmin`, precedence admin-block > not-connected.
**Usability is connection ∩ effective allowlist — the per-agent GRANTS layer is
gone** (removed from the app AND the host; the cloud gateway retires its own
enforcement separately). `allowlist === null` (unrestricted) reads as pass. The
agent-tab view model classifies every connection through it — no surface
re-derives the rule.

**Permissions live in exactly ONE place: the top-level Permissions view**
(`app/src/components/permissions/`, `PERMISSIONS_VIEW_ID = "permissions"`). People →
which agents each member may use; Agents → what each agent may use (the app + model
allowlist ceilings, mounting the SAME editors — `AgentAdminIntegrations` /
`AgentAllowlistSection` and `AgentAdminModel` / `AgentModelsSection`). Everywhere else
in the app shows ZERO permission management and ZERO "which agents use this app"
displays; a blocked thing keeps transparency + a single role-aware pointer into
Permissions (see §3, `blocked-ceiling.ts`).

### The grants system — REMOVED (client AND host)
The entire per-`(user, agent)` grants plumbing beneath the app was deleted, not
just the UI:
- **App**: `useAgentGrants` / `useAgentGrantMutation` / `useAgentGrantToggle` /
  `useAllAgentGrants` / the `grant-set.ts` helpers, `connected-apps-model`'s
  `toolkitAgentIds`/`agentChipsFor`, the `agent-chip(s)` "which agents" display,
  `useConnectFlow`'s `autoGrant` path, `tauriIntegrations.grants/setGrants`, and
  the `queryKeys.agentGrants` / `["agent-grants"]` invalidation key.
- **Client chain**: `engine-client` `agentIntegrationGrants()` /
  `setAgentIntegrationGrants()`, the web engine-adapter mixin + `cp/agent-teams`
  counterparts, `runtime-client` `getIntegrationGrants` / `putIntegrationGrants`,
  and the SDK `integrations.grants/setGrants` + `IntegrationsCommand.Grants/SetGrants`.
- **Host**: `integrations/grants.ts` (`LocalIntegrationGrants`,
  `filterMatchesToGranted`, `isActionGranted`, `normalizeToolkits`),
  `grant-store.ts` (the `IntegrationGrantStore` + File/Memory impls), the
  `GET`/`PUT /v1/agents/:agentId/integration-grants` route, its wiring in
  `local/host.ts` + `ControlPlaneDeps`, the sandbox search-filter + execute 403,
  and the store-ir publish-time union with grants. `search`/`execute` now run
  unfiltered on this host.
- **fake-host**: the `integration-grants` route + `grants` state map are gone;
  connections / settings are intact.

**Stale files are inert.** `<agent>/.houston/integration-grants.json` files
written by earlier builds are IGNORED harmlessly — nothing reads them, no boot
migration is needed, and no generic globber touches them. They are removed for
free whenever the agent dir is deleted.

---

## 2b. Confirming an action — model-driven, no host gate (HOU-885)

Confirmation before a write is now a **model-driven `ask_user` question**, not a
host-side gate. When an agent is about to run a consequential
`integration_execute` in **Ask first** mode, it asks the user first through the
normal `ask_user` tool (rendered as a branded confirmation question in chat); the
model decides when to ask, guided by the prompt. There is NO host approval card,
no per-action grant, no TTL.

**The host executes every authenticated execute directly.** `/sandbox/integrations/execute`
(`packages/host/src/routes/integrations-sandbox.ts`) runs the call as soon as the
sandbox HMAC authenticates it — read or write, every mode. The old execute-time
gate (the read-only classifier, the Autopilot `x-houston-turn-mode: auto` bypass,
the fresh-grant check, the 409 `approval_required` response, the display/hash
helpers, `resolveToolkit`) and its whole store/route/UI stack are DELETED. The
policy that remains lives ELSEWHERE, untouched: the Planner cannot act at all
(it blocks writes upstream), and the closed cloud gateway's toolkit allowlist
still 403s an out-of-allowlist execute (§1, §2).

**Mode semantics.** In **Ask first** the model asks before a consequential write
via `ask_user`; in **Autopilot** the agent cannot pause on the user, so it does
not ask — fire-and-forget executes directly. The distinction is purely a prompt/
model concern now; the host does not read the turn mode for integrations.

**Stale files are inert.** `<agent>/.houston/action-approvals.json` records
written by earlier builds are ignored — nothing reads them, no migration is
needed, and they are removed for free whenever the agent dir is deleted.

**Gone entirely:** `packages/host/src/integrations/{action-approvals.ts,
action-approval-store.ts, action-classification.ts, approvals.ts, agent-file.ts}`,
`packages/host/src/routes/action-approvals.ts`, the `actionApprovals` dep on
`ControlPlaneDeps`/`AgentAuthzDeps`, its wiring in `local/host.ts` and the
`/agents/:id/action-approvals/*` dispatch, and the fake-host `state-action-approvals.ts`
+ `routes-action-approvals.ts`. The old Always-allow / one-shot-ticket / 15-minute-
grant systems are all gone with it.

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
(`integrations/use-connected-apps.ts`) yields sorted `ActiveAppRow` /
`RecoveringAppRow` over the pure, node-tested `partitionConnections`
(`integrations/connected-apps-model.ts`). It carries NO grant plumbing — the old
`grantMap` / `editableAgentIds` / `agentChips` fields and the `toolkitAgentIds` /
`agentChipsFor` helpers were removed with the app-side grants layer. The global
page's detail modal reads it verbatim (info + reconnect + disconnect only). The
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
`catalogCategorySlugs` (`browse-sections.ts`) — A-Z by label, `UNCATEGORIZED` pinned
last (the dropdown is a lookup-by-name surface, so it orders alphabetically even
though the page's sections order mainstream-first, then by size). Pure helpers in `integrations/model.ts` (node-tested):
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
  catalog family — reuse it wherever a surface wants "ONE top `controls` row over an
  Installed section and an Available section", each rendered under an `lg`
  `CatalogSectionHeader` (`size="lg"`) with a live `CatalogCount` chip). A
  `PageHeader` hero (title + `home.description` subtitle, whose count reads the FULL
  catalog size via `home.descriptionCount`), then the shell:
  (0) the ONE **controls** row (`catalog-controls.tsx` → `CatalogControls`): a
  `CatalogSearchField` (`home.searchPlaceholder`) + the searchable A-Z category
  `FilterCombobox`. It sits ABOVE both sections and its query + category narrow the
  Installed strip AND the Integrations tab together. The surface owns that state in
  the shared `use-catalog-surface.ts` hook (`useCatalogSurface` → `tab`, `query`,
  `category`, `filtering`, `shown`, `installedCount`, `availableCount`), used verbatim
  by the global page and the per-agent tab so the two-section wiring lives in ONE
  place; a parent that remounts per agent (`key={agent.id}`) gets per-agent state for
  free.
  (1) the CONSOLIDATED **Installed** strip, OUTSIDE the tabs (identity, not
  discovery — it never changes with the tab): active catalog connections AND custom
  integrations as a two-column `CatalogGrid` of `CatalogRow`s (`InstalledStrip`) —
  the SAME row grammar as the browse catalog: brand art via `AppLogo` (custom rows
  get letter avatars), the always-visible name, a one-line description (the app
  description or a localized custom-kind badge), an always-visible
  presence-style `StatusDot` LEFT of the name ("● Asana" — green/amber/red per
  connection status, sr-only status label, via the ui/core `CatalogRow`
  `statusDot` slot — connected state reads on the ROW, not just from section
  placement; same treatment as the connected-providers strip and the skills
  marketplace's installed rows), and a quiet trailing `ChevronRight`
  marking each row as an open-affordance (the shared convention with the connected
  providers + installed skills strips). A catalog row opens `AppDetailDialog`; a
  custom row jumps to the Custom tab. At rest the grid caps to the shared
  `CATALOG_INSTALLED_PREVIEW_CAP` (6) rows behind a quiet `CatalogShowMore`
  "Show all N" expander (`home.showAllApps`) so a well-stocked strip never buries
  the discovery tabs; while the shared filter is active (`filtering`) every match
  renders uncapped — filtering IS looking past the preview. That preview /
  expander split is the ONE shared pure helper `installedPreview<T>(items, {
  searching, expanded, cap })` (`app/src/lib/installed-preview.ts`) all three
  installed strips call (integrations, skills, connected providers); the cap is
  injected (not imported) so the module stays free of the `@houston-ai/core` JSX
  barrel and testable under `node --test`. The strip has NO search of its own: the
  ONE top controls row filters it. The `lg` section header carries a `CatalogCount`
  chip (`installedCount` — the SHOWN count while filtering, the total at rest). The
  shared query + category narrow the rows via the pure `filterInstalledBy(active,
  custom, catalog, { query, category })` (node-safe `lib/installed-preview.ts` —
  category narrows first via `toolkitsInCategory`, then delegates to `filterInstalled`
  for the substring query; custom integrations carry no category so any active
  category excludes them). When that filter leaves NOTHING installed the whole
  Installed section is OMITTED (the shell drops it — no heading over an empty list),
  so the strip only ever renders with rows.
  (2) the **Available** section (`home.availableTitle`) under its own `lg`
  `CatalogSectionHeader`, whose `availableCount` chip = the connectable apps matching
  the shared filter (via `browseCatalogView`, respecting a Teams allowlist), over two
  discovery tabs (`home.tabs.*`, each trigger with a `CatalogCount` badge):
  **Integrations** (the CONTROLLED `catalog-pane.tsx`: it takes `query` + `category`
  props from the page — its own controls row moved UP into `CatalogControls` — and
  renders `RecoveryRow`s + the grouped `CategoryCatalog`; the tab's own count chip
  stays the UNFILTERED connectable total) and **Custom integrations**
  (`CustomIntegrationsSection variant="tab"`; count = the custom list, and it KEEPS
  its own internal search). The connect flow lives on the PAGE so
  switching tabs never kills an in-flight OAuth poll. When the host doesn't serve
  custom integrations (`useCustomIntegrations` → `null`) the shell has ONE tab and
  drops the tab chrome entirely.
  `CategoryCatalog` groups the connectable catalog (connected toolkits EXCLUDED) by
  primary category into flat two-column `PlaneAppRow`s, sections ordered MAINSTREAM-FIRST
  then by size via the pure `groupCatalogByCategory` (`browse-sections.ts`, split from
  `browse-model.ts` to hold the file-size line — the filter/allowlist half stays in
  `browse-model.ts`, the section-grouping + Featured half moved out; the curated ordering
  list is a further split into `category-priority.ts`; all re-export through the barrel so
  consumers import unchanged). Section order for our NON-technical audience: the curated
  `CATEGORY_PRIORITY` categories (`category-priority.ts` — Felipe's hand-picked order:
  social-media-accounts, file-management-and-storage, spreadsheets, team-chat,
  team-collaboration, productivity, ai-meeting-assistants, ads-and-conversion, notes,
  signatures; matched via `categoryRank`'s spelling-insensitive normalization, `&`→"and",
  non-alphanumerics dropped; `developer-tools`/AI deliberately ABSENT) come first in that
  order (only those present), then every remaining category by app-count DESC (label
  tiebreak), `UNCATEGORIZED` pinned last — so a small curated section leads a huge
  "Developer tools" instead of the raw size ranking floating dev/AI apps up. Each section header carries its count chip
  (`CatalogSectionHeader` `count` — the chevron accent is GONE from the section-header
  idiom). At REST ONLY (no search query AND no single-category narrowing) a curated
  **Most used** spotlight (`MOST_USED = "__mostUsed"`, an ordered `MOST_USED_SLUGS`
  list of everyday apps — gmail, calendar, notion, sheets, slack, twitter, linkedin,
  whatsapp, instagram…) is pinned FIRST above the category sections, so a first-time
  user meets familiar apps instead of "Developer tools"; it renders under
  `t("home.mostUsed")` ("Most used" / "Más usadas" / "Mais usadas"). Membership is
  COMMITTED data, deliberately not Composio's live usage sort: the API does expose
  `GET /api/v3/toolkits?sort_by=usage` (verified 2026-07-22; it is also the default
  order), but it ranks global Composio (developer) usage — github/supabase/
  perplexityai in the top ten — so the list stays hand-picked, ordered by those same
  apps' relative ranks from that verified data (rank comments in
  `browse-sections.ts`). Most-used apps still appear in their own category sections
  too (a spotlight, not a move), already-connected apps drop out, and `MOST_USED`
  never leaks into `catalogCategorySlugs` (the dropdown options). A search or a
  category pick suppresses it (the curated list would fight a deliberate narrowing). Each row is the split `CatalogRow`
  (`ui/core/src/components/catalog-row.tsx`): the row BODY opens the app's
  "more info" modal (`app-info-dialog.tsx` over the generic `CatalogDetailDialog` —
  art, name, category `Badge` chips, the FULL description, a Connect CTA), while
  the GHOST round `+` at the right edge (`CatalogAddButton`: full-ink icon,
  transparent at rest, hover fills the circle with the elevated `input` surface —
  white in light mode — against the row's `hover` wash; spins while THIS app
  connects, disables while another owns the flow — the body stays clickable) is
  the ONLY row-level connect. Copy: `home.connect` /
  `home.connectApp`. Disconnect is scope `everywhere` (a user-level connection
  disappears for ALL agents); the confirm names no agents (chip plumbing removed).
  This page is a PERSONAL-CONNECTIONS surface only: a connected app's
  `AppDetailDialog` (opened from the Installed strip row) shows info + reconnect +
  disconnect, with NO per-agent grant toggles — which agents may use an app is
  managed in the Permissions view. The detail modal + disconnect dialog are
  extracted into `connected-app-dialogs.tsx` (`ConnectedAppDialogs`) so
  `integrations-ready.tsx` stays within the file-size limit; the page owns the
  selection + connect flow and hands them in. The presentational pieces
  live in `components/integrations-view/` (`catalog-controls`, `catalog-pane`,
  `installed-strip`, `plane-app-row`, `category-catalog`, `recovery-row`,
  `connected-app-dialogs`, `use-catalog-surface`); the old per-strip
  `catalog-search-field.tsx` + `use-installed-search.ts` were DELETED when the search
  moved to the ONE top controls row. The old two-column `ConnectedAppsList` card grid was
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
(Felipe's call). The global Integrations page is the personal connections lens
(connection status + reconnect + disconnect), reached only via its sidebar nav.
The `settings:connectedAccounts.*` copy block, the `nav.connectedAccounts` /
`index.rows.connectedAccounts` / `index.values.appsCount` row keys, and the
`home.usedByNone`/`home.usedByAll` chip keys were all deleted. The page's
`AppDetailDialog` no longer carries any per-agent grant surface — which agents may
use an app is managed in the Permissions view (§2) — see the global page block above.

**Agent tab (the by-agent lens)** — `app/src/components/tabs/agent-integrations/`
(`integrations-tab.tsx` re-exports the orchestrator). The tab body is the SAME
catalog layout as the global Integrations page, minus the page header (the tab
label already says Integrations): `agent-integrations-body.tsx` renders the shared
`CatalogShell` — the ONE top `CatalogControls` row over the Installed section (the
agent's usable ACTIVE apps + the user's custom integrations; a row opens
`AppDetailDialog`, whose Disconnect confirms via `IntegrationDisconnectDialog` scope
`everywhere`; a custom row jumps to the Custom tab) and the Available section's
Integrations / Custom integrations tabs. It carries the SAME two-section grammar as
the global page and shares the ONE `useCatalogSurface(...)` hook
(`integrations-view/use-catalog-surface.ts` — owns `tab` / `query` / `category` /
`filtering` / `shown` / `installedCount` / `availableCount`, the shared query +
category filtering the Installed strip via `filterInstalledBy` and the Available
count via `browseCatalogView`); passing `allowlist` narrows only the available count
(locked apps never count). The strip has no search of its own, its `lg` header count
follows the shared filter, and it is OMITTED when the filter leaves nothing
installed. State lives in the hook, so this tab's `key={agent.id}` remount keeps it
naturally per-agent. The catalog
tab is the SHARED CONTROLLED `CatalogPane` (`integrations-view/catalog-pane.tsx`:
takes `query` + `category` props from the page, recovery rows, the grouped
`CategoryCatalog`),
generalized to plain props (`catalog`/`connections`/`query`/`category`/`recovering`/
`allowlist`/`readOnly`/`children`) so both surfaces consume it verbatim — the agent tab passes
`AgentCatalogSections` as its `children`. The view is a flat
`{activeRows, disallowedRows}` (`agentIntegrationsView`, no more grants/degraded
mode split), every connection classified through the ONE `effectiveAccess`
resolver (§2): **usable = connection ∩ effective allowlist**. Active rows split
into strip rows vs recovery rows by connection status; connected apps outside the
allowlist go to `disallowedRows`. The old **"Connected, but off for this agent"**
grant section (`agent-ungranted-apps-section.tsx`, `useAgentGrantMutation`,
`integrations:agentTab.offForAgent.*`) and the `availableRows` bucket are GONE —
connecting an app makes it usable (∩ allowlist), no per-agent toggle. The
`disallowedRows` render the transparency section (`agent-disallowed-apps-section.tsx`,
"Not allowed" + role-aware Permissions CTA). The old **"Runs without asking"**
review that reviewed/revoked the per-agent action-approval always-list was REMOVED
with the whole approval system (§2b — confirmation is now a model-driven `ask_user`
question, no host-side always-list to manage). Recovery
**Remove** DISCONNECTS the user's connection. Connect forwards the agent slug so the
gateway enforces the agent's allowlist (`useConnectFlow`, `autoGrant` removed). The tab
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
`locked` (outside it). ONLY the per-agent tab feeds it a ceiling — it passes the
agent's effective `allowlist`. The **global Integrations page** has no ceiling to apply
(policy is per agent only; the org-wide ceiling was removed 2026-07-16), so it always
passes `allowlist === null` and never locks a row. Locked apps render via
`CatalogLockedSection`: read-only
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
/ `teams:integrations.notAllowed.enableInPermissions`) that deep-links into the top-level
**Permissions view** (`setViewMode(PERMISSIONS_VIEW_ID)` from `../permissions/id` + a
`usePermissionsNav` request from `../permissions/permissions-nav-store`). A blocked app is
always outside the AGENT ceiling (policy is per agent only), so the fix always deep-links to
this agent's per-agent Permissions detail via `requestAgentDetail(agentId)`. The resolver
(`resolvePermissionsFix`) returns `undefined` — member copy, unchanged — whenever the viewer
lacks the authority (`isAgentManager && canSeeMembers`; the `canSeeMembers` guard keeps a
non-admin manager, who can't open the Permissions dashboard, from getting a dead link). The
leaf sections stay presentational (props only, no store imports); the resolver is BUILT at
the per-agent tab (`agent-integrations-tab.tsx`) and threaded down through
`CatalogPane`/`CategoryCatalog` (`lockedFix`) and `AgentCatalogSections` (`permissionsFix`).
The global Integrations page never builds a resolver (it has no ceiling and never locks a
row). Pure logic is node-tested in `app/tests/blocked-ceiling.test.ts`.

**Connect flow + pending recovery** — `useConnectFlow` (in the shared module) lives
on the SURFACE, never inside the picker, so closing the dialog never kills polling.
It mints the hosted link, opens the browser, polls until active (a `Waker` backs
the sleep so `checkNow()` wakes an immediate poll and `cancel()` returns
`"cancelled"`), then invalidates connections. In agent context the connect
forwards the agent slug so the gateway checks its allowlist on OAuth. An abandoned
OAuth is recoverable inline on BOTH surfaces while the flow is live via the
`ConnectWaitingPanel` (Reopen / I have finished / Cancel). A connection left
pending/errored across sessions surfaces a `PendingConnectionCallout` (pending →
Finish connecting; error → Reconnect; both a fresh link) + Remove on the global
page and on the agent tab's own app rows. An orphaned pending connection is
recovered from the global page (the agent tab links there via "Manage all
integrations"). While any connect is waiting,
other Connect buttons are disabled (single flight). Only outcomes `call()` cannot
see are toasted (timeout, provider-side OAuth failure); a cancel is silent by
design.

**Agent-initiated connect (in-chat).** When an agent needs an unconnected app it
calls the integration-gated `request_connection` tool (never writes a link). That
records a `{kind:"connect", toolkit, reason?}` pending interaction which rides the
turn's clean `done` frame and settles the board card to `needs_you`; the pending
interaction renders a `ChatInteractionCard` stepper that REPLACES the composer
while pending (HOU-870, `composerOverrideMode: "replace"` — one text input on
screen; dismissing restores the composer), whose
connect step is `ChatConnectInteractionCard`. Every step (question, sign-in,
connect, credential) composes ONE shared modal shell — `InteractionModal` + `InteractionModalTitle`
in `ui/chat` (reference "Coworker card" look, inventory v19) — that owns the
surface, the HEADER row (title left; `‹ N of M ›` pager + dismiss X top-right),
the body, and a right-aligned FOOTER row. Every step kind also carries an
always-visible free-text row (`InlineTextRow`, ui/chat): submitted text records
a decline-with-instruction the agent hears in the composed reply. The connect step's `(icon) NAME`
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

**Confirming an action (in-chat) — REMOVED as a dedicated card (HOU-885).** The
host no longer gates `integration_execute`, so there is no `approval` step and no
dedicated action-approval card. Confirmation before a consequential write is now a
model-driven branded `ask_user` question (Ask first mode), rendered by the same
question step of the interaction stepper as any other `ask_user` — not a special
Composio-aware approval card. The old `ChatApprovalInteractionCard` /
`renderApproval` prop / three-way Always-allow / Deny / Allow-once footer and the
`approvedLine` / `deniedLine` reply plumbing are gone.

**No silent failures.** All engine mutations route through `call()`
(`app/src/lib/tauri.ts`), which toasts + reports once, so the integration hooks
carry NO `onError` (a second toast would double up).

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
slug. The sandbox routes a `tools.`-prefixed action to the `custom` provider
(`providerForAction`, `CUSTOM_ACTION_PREFIX`).

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
travels UI → `POST .../integrations/custom/definitions/:slug/credential` on the
**per-agent surface** (`/agents/:id/...` — HOU-823, see User routes below) →
validate (`connections.validate`, fail-open on `unknown`) → secret store →
connection rewire. It NEVER enters the transcript; the prompt (houston-prompt.ts
+ the Rust mirror) forbids asking for keys in chat.

**A spec with no security scheme still takes a key (the PriceLabs fix).** Many
real specs (and agent-authored ones) declare NO `securitySchemes` — the key is
just a documented header. That used to dead-end the secure save with
`credential_invalid` on every attempt while pasting the key in chat worked (the
worst possible incentive). Compile now injects a synthesized `houston_fallback`
method for credential-mode OpenAPI defs with no collectible method
(`custom/fallback-auth.ts` → `executor.openapi.configure`): the placement is
derived from the spec's own api-key-shaped header/query parameter
(`X-API-Key`-like names; an `Authorization` param gets `Bearer `), else the
`Authorization: Bearer` default the MCP path already uses. The executor is
in-memory, so every rebuild re-injects the SAME slug before the stored
credential's connection re-renders through it. `setCredential` also heals defs
added as `auth:"none"` (a later `request_credential` upgrades them), and its
residual failures (uncompiled def; MCP def with no declared method) carry
actionable messages. The secret FILE write is platform-correct: 0600 asserted
on POSIX; on Windows (no POSIX modes — NTFS ACLs under the user profile are the
protection) the write skips chmod and clears a stray read-only attribute before
its rename-replace.

**User routes** (`routes/custom-integrations-user.ts`; the sandbox detect/add
routes stay in `routes/custom-integrations.ts`): GET/DELETE
`definitions[/:slug]` + the credential POST, on THREE surfaces: top-level
`/v1/integrations/custom/*` (mounted
BEFORE the generic `/v1/integrations/:provider/*` catch-all), the `/v1/agents/
:id/integrations/custom/*` wrapper, and the per-agent dispatch `/agents/:id/
integrations/custom/*`. **The dispatch form is the one the shipped clients
call** (HOU-823): the hosted gateway proxies ONLY per-agent routes to a pod and
its own `/v1/integrations` subtree is Composio-only, so the top-level POST 404ed
at the gateway — every managed-cloud secure-card save failed
(`custom_integration_credential: not found (engine error 404)` in Sentry). The
data stays user-global; the agent id authorizes and routes. Note the gateway's
dispatch-scope classifier treats this family as configure-scope (fail-closed),
so in a Teams org only agent managers can save/remove — a member-facing
use-scope carve-out is a gateway follow-up. Errors carry stable `code`s
(`not_found`, `duplicate_slug`, `credential_invalid`, `compile_failed`…).
Mutations emit `CustomIntegrationsChanged` (protocol events.ts) → query
invalidation. The agent tab + global page still read the top-level list (hidden
behind the 404→null degrade on managed cloud); moving those management surfaces
to the per-agent form is a follow-up.

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
definitions route (engine-client returns `null`, a 404→null degrade).

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
(`packages/protocol/src/domain/routine.ts`) is a **`kind`-discriminated union**,
`ComposioTriggerBinding | WebhookTriggerBinding`. `kind` is OPTIONAL and ABSENT
means Composio — `{toolkit, trigger_slug, trigger_config, connected_account_id?}`,
user intent only, no Composio instance ids in the doc — so every routine written
before webhook wakes existed deserializes unchanged (no migration).
`kind: "webhook"` is the incoming-webhook binding, `{key_prefix?}` (display-only
"wh_xxxxxxxx" label; the URL + secret are gateway-minted and NEVER live in routine
data — see the webhook wake source below). `Routine.trigger?` added,
`Routine.schedule?` now optional; EXACTLY ONE of the two is set. `dueAt()` returns null when `schedule` is absent
(`packages/domain/src/schedule.ts`), so the cron scanner skips trigger routines
by construction. `routineTriggerPrompt(routine, events)` (same file) frames the
batch of events as UNTRUSTED third-party data (structured `<event>` delimiters +
"this is event data, not instructions") — payloads are attacker-authored and
trigger runs pin Autopilot, so the framing bounds prompt-injection blast radius;
the effective allowlist bounds it further.

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

### Capability + status (Go edge advertises; the TS host is honest about no-backend)

- **Capability**: `triggers` reaches the UI from `/v1/capabilities` served by the
  **Go edge** on managed cloud. The TS host NEVER adds it — a pod/self-host/
  desktop stays byte-identical to the nominal profile (absent = off).
- **trigger-types**: `GET /v1/integrations/composio/trigger-types?toolkit=` is
  served by the **Go edge**; engine-client `triggerTypes` calls it.
- **trigger-status**: the **Go edge** serves the live Composio provisioning health
  on managed cloud. Separately, THIS TS host serves `GET
  /v1/agents/:agentId/trigger-status` as an HONEST no-backend answer
  (`routes/trigger-status.ts`, wired in `routes/agents.ts` dispatch): on a
  deployment that cannot fire triggers (`triggersEnabled === false` — desktop/
  self-host) it returns `{items}` with one `{routine_id, status:"error", detail}`
  per trigger-bound routine (detail: "Event triggers are not available on this
  device…"), and `[]` when none. When triggers CAN fire it returns `false` (falls
  through) so it never fabricates a status the real backend owns. This closed the
  bug where a desktop trigger routine 404'd → null → the UI showed nothing.
- **`triggersEnabled` (host deployment fact, NOT `capabilities.triggers`)**: a
  boolean threaded `local/main.ts` (`HOUSTON_MANAGED_CLOUD==="1"`) →
  `LocalHostOptions` → `ControlPlaneDeps`/`AgentRouteDeps`. Drives THREE things:
  the trigger-status route above, the **routine write gate**, and the **product
  prompt**. It is separate from the client-facing `capabilities.triggers` (which
  the TS host never sets on itself) precisely so the write gate does NOT wrongly
  reject trigger writes on managed-cloud pods, where triggers DO fire.
- **Write gate** (`routes/agent-data.ts`): a routine POST/PATCH whose result
  carries a `trigger` binding is rejected `400 {error:"Event triggers are not
  available here. Give this automation a schedule instead."}` when
  `triggersEnabled` is false. Schedules pass untouched; existing on-disk trigger
  routines still LOAD and LIST (reads are ungated) — they just get the error
  status above and can be PATCHed to a schedule to escape.
- **Product prompt** (`houston-prompt.ts` + `houston-prompt-routines.ts`):
  `houstonSystemPrompt({triggers})` advertises event wakes ONLY when triggers can
  fire; the schedule-only variant tells the agent an event wake needs Houston
  Cloud and to offer a schedule instead.

### Webhook wake source (gateway ingress + one-time mint)

A `kind: "webhook"` binding wakes a routine whenever any external system POSTs to
the routine's own minted URL. This is a **hosted-cloud-only backend**: the Go
gateway owns the public ingress and the mint. `POST /v1/agents/:slug/routines/:id/
webhook-key` returns a `WebhookKeyReveal` `{url, secret, key_prefix}` shown to the
user EXACTLY once (revealed in `webhook-key-dialog.tsx`, held only in the chip's
local state, never the query cache or routine data). Only `key_prefix` (the
display-only "wh_xxxxxxxx" label) is stamped back onto the routine's binding so
the UI can show a key exists; absent `key_prefix` = not minted yet. The gateway is
the sole owner of ingress, verification, and mint — this TS host carries no
webhook code. Full cross-repo contract: `cloud/docs/contracts/C9-triggers.md`.

### UI surfaces — the Routines tab (chat-first, one merged list)

Schedule-driven and event-driven routines live in the ONE **Routines** tab (tab
id stays `routines` — a persisted viewMode value; label en "Routines", es
"Rutinas", pt "Rotinas").
The schedule/event split is an engineering distinction, not a user one, so the tab
set never varies by deployment and the wake mechanism is a choice made **while
creating** a routine, not a form field on the row. The domain model stays ONE
`routines.json` list; the tab (`app/src/components/tabs/routines-tab.tsx`) renders
it via `@houston-ai/routines` `RoutinesGrid`, with per-row sentence summaries and
Active / Paused sections. Each row is **chat-first**: clicking it opens the
routine's setup chat in the shell-level mission panel (split view, via
`useShellDetailPanel`); the row itself carries only an enable/disable toggle, a
three-dot menu (Run now / Stop run, Delete), and — for a schedule routine — an
inline schedule-edit popover (`ScheduleBuilder`). There is **no manual form
editor and no Dialog wizard**; the deleted `RoutineRowEdit` / `RoutineTriggerEditor`
/ `TriggerPicker` / `TriggerConfigForm` are gone.

Creation runs through the scripted **in-chat intake**
(`app/src/components/tabs/automation-intake/`) — cards that look exactly like the
agent's real `ask_user` cards but run locally with zero model calls: a fork
("from scratch" / "from a template"), then (only where `capabilities.triggers` is
on) a wake question (schedule / app event / webhook). The app-event card
(`intake-trigger-card.tsx`) has the user pick **only the APP** — usable apps are
the agent's connections ∩ effective allowlist (`use-usable-toolkits`), and an
unconnected app connects **inline** in the card (`connect-inline.tsx`). WHAT event
in that app should wake it is decided later, in plain words, in the AI setup chat;
the chosen app's event catalog is embedded into that chat's kickoff prompt
(`routine-chat-handoff-wake.ts` `wakeSaveRule`, an internal `<event_catalog>` the
agent copies a `slug` from verbatim). Skipping any intake question hands off to a
full AI interview from scratch. The setup-chat kickoff is
`routine-chat-prompts.ts` (offering the event wake only when triggers are on);
setup chats carry `ROUTINE_SETUP_AGENT_MODE` and run as Coworker (`execute`). The
live per-routine health block (`RoutineTriggerStatus` / `TriggerStatusBadge`)
renders for every trigger-bound routine, offering one-click reconnect on a
disconnected state. Read queries: `useTriggerTypes` / trigger-status in
`app/src/hooks/queries/use-triggers.ts`, gated on the `triggers` capability so a
desktop build never fetches the catalog.
