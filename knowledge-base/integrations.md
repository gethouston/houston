# Integrations (Composio platform mode)

How Houston connects third-party apps (Gmail, Slack, …) so agents can act on them.
Two providers live behind the port: **Composio** (the hosted catalog, this doc) and
**`custom`** (user-added OpenAPI/MCP sources →
[custom-integrations.md](custom-integrations.md)). Event-driven routine wakes →
[routine-triggers.md](routine-triggers.md).

> Not an AI provider. Integrations are tool connections, never LLM providers — they
> go through `IntegrationProvider`, never the pi provider registry.

---

## 1. Platform-mode architecture (host)

- **Platform model.** Houston holds ONE Composio project API key. Every Houston user
  is a plain Composio `user_id` under that project; users never create a Composio
  account, they only OAuth the app itself (Composio hosts the dance). The key is
  cloud/self-host only — it must never ship in a client binary.
- **The port** — `packages/host/src/integrations/provider.ts` `IntegrationProvider`:
  `readiness`, `listToolkits`, `listConnections(userId)`, `connect(userId, toolkit)`,
  `connection`, `disconnect`, plus the two the agent's generic tools call:
  `search(userId, query, acting?)` and `execute(userId, action, params, acting?)`.
  Host routes + tools depend ONLY on this interface; no provider SDK or wire type
  leaks past its adapter. Availability is a capability flag
  (`/v1/capabilities` `integrations`), not a forked build.
- **Registry** (`registry.ts`) — `IntegrationRegistry` keyed by provider id. An empty
  registry is valid (integrations off → capability false, routes 404/503). A
  duplicate id throws (wiring bug); an unknown id throws (never silently undefined).

### Two adapters, one interface

- **`ComposioProvider` (`composio.ts`) — the DIRECT adapter.** Speaks Composio v3
  REST directly (`x-api-key`), no CLI/SDK. Used by cloud + self-host, which hold the
  key. `userId` scopes each user's connections. Connect uses
  `POST /api/v3.1/connected_accounts/link`.
  - Every `/tools` read and execute pins Composio's TOOL VERSION to `latest`
    (`TOOL_VERSION`). The v3 endpoints otherwise default to the frozen base snapshot
    `00000000_00`, whose connector code ages until the third-party API retires what
    it depends on (prod symptom: LinkedIn create-post `426 NONEXISTENT_VERSION` from a
    retired `Linkedin-Version` header) and which hides every tool added since.
    **Search and execute pin TOGETHER** so the schema the model read and the connector
    that runs are the same version.
- **`RemoteIntegrationProvider` (`remote.ts`) — the GATEWAY adapter**, the desktop's
  provider. The desktop holds NO key: every port call forwards to Houston's cloud host
  `/v1/integrations/*` with the user's Firebase (GCIP) ID token. The upstream verifies
  the JWT and re-derives the Composio `user_id` from its `sub`, so a client can never
  act as another user and connections follow the user across desktop and cloud. The
  port's `userId` args are ignored here.
- **Session sync (desktop).** The frontend owns the GCIP session (refresh via
  `app/src/lib/identity/refresh.ts`); `setIntegrationSession(token | null)` pushes the
  current token (null on sign-out). With no session the adapter reports not-ready and
  throws `IntegrationSigninRequiredError`, surfaced as an actionable 409 / sign-in
  state.
- **Sandbox path.** The agent runtime never talks to a provider directly. Its generic
  tools call the host over the per-sandbox proxy
  (`routes/integrations-sandbox.ts`); the sandbox HMAC token binds
  `{workspaceId, agentId}` (`EnvCredentialVault`), so the route knows which agent is
  acting without extra plumbing. `search`/`execute` receive the `ActingContext` (C2):
  `actingAs` (per-turn token) or `actingUser` (routine creator's `sub`); the direct
  adapter ignores both — identity is the verified `userId`.

### App-status taxonomy (HOU-681)

Every search result carries an `IntegrationAppStatus`
(`packages/host/src/integrations/types.ts`) — the load-bearing enum telling the agent
which of four speech acts to perform:

| Status | Meaning | The agent's move |
| --- | --- | --- |
| `connected` | acting user has an active connection | use it |
| `connectable` | a real toolkit, not connected yet | briefly offer + `request_connection` |
| `blocked` | a real toolkit outside this agent's allowlist | say it can be switched on in the agent's Settings, under Apps; never imply Houston lacks it, never `request_connection` |
| `unknown` | not a recognized toolkit (reserved; today an unrecognized query is simply an EMPTY result) | say plainly no such app is available |

- **`blocked` is produced solely by the closed cloud gateway** (Teams v2, C7), which
  annotates its `/search` items and strips their `inputParams`. Nothing in THIS repo
  emits it — the direct adapter only knows `connected`/`connectable`. It is an
  AGENT-facing enum read in a tool result; **no client surface renders it**.
- `connected` is kept alongside the legacy `connected` boolean (HOU-670 keeps
  `connected === false` matches discoverable for the in-chat connect card); `status`
  is the additive superset.
- The gateway adapter reads each `/search` item TOLERANTLY: a valid `status` passes
  through verbatim; an absent or unrecognized one derives from the `connected`
  boolean (`statusFromConnected`). The field is never required.

### Search flow (direct adapter)

`composio.ts` → `composio-search.ts` runs THREE lookups and merges them (scoped
first, deduped by action, then catalog entries):

1. **scoped** query over the user's CONNECTED toolkits (precision; degrades to
   LISTING their actions on a zero-hit everyday phrasing), then
2. **global** query — ALWAYS runs, never short-circuited, so new apps are
   discoverable. (The old connected-scoped short-circuit meant a connected-Gmail user
   could not discover Google Sheets.) Then
3. **catalog resolution** — Composio's action full-text scores ~zero for a plain app
   NAME, so the query is resolved against the toolkits catalog
   (`GET /api/v3/toolkits`, cached in-process, 1h TTL, shared in-flight promise) to a
   real slug and surfaced as a **toolkit-level entry** (`action: ""`) even when no
   action scored — so the model always learns the slug to pass `request_connection`.

Status is derived from the acting user's active connections.

### Runtime tool text + refusals

- `packages/runtime/src/session/tools/integrations.ts` is status-aware: connected
  actions as before; `connectable` entries name the exact slug and teach
  `request_connection`; `blocked` renders `, TURNED OFF` and forbids
  `request_connection`; a genuinely EMPTY result says no such app/action exists (a
  real not-found, NOT a policy block).
- **Execute-time allowlist refusal.** The gateway 403s an out-of-allowlist `execute`
  with `{code:"toolkit_not_allowed"}` (the sole execute gate, C7). The sandbox proxy
  relays that body verbatim (`integrationUpstreamErrorFromResponse` →
  `IntegrationUpstreamError` → `relayIntegrationUpstreamError`, preserving the JSON
  `code`), so `integration_execute` classifies by the stable `code`, never the bare
  403, and RETURNS guidance (the app is turned off for this agent; tell the user to
  enable it in Settings, under Apps; do not retry until they confirm) — never a
  thrown/raw error. Marked `details.appTurnedOff`.
- **No access to the agent (HOU-967).** The gateway 403s `{code:"not_assigned"}` when
  the acting user is not one of the people with access. BOTH `integration_search` and
  `integration_execute` classify it and RETURN guidance (someone who manages the agent
  grants access in Permissions > this agent > People; do not retry, do not
  `request_connection`), marked `details.noAgentAccess`. The gateway's own phrasing
  and JSON body never reach the model.
- **Any OTHER unrecognized 4xx**: the body is REDACTED from the thrown message,
  leaving `integrations <path> failed (<status>[, code <code>])` plus a plain
  instruction not to quote technical detail. Uncoded 5xx keeps its body (transient,
  diagnostic).
- **Prompt contract** — the four speech acts live in
  `packages/host/src/houston-prompt.ts` INTEGRATIONS section and its verbatim Rust
  mirror `app/src-tauri/src/houston_prompt/integrations.rs`
  (`PI_INTEGRATIONS_GUIDANCE`, kept in sync). An empty result never means an app is
  unsupported — trust the reported status.

---

## 2. App-usage policy — which agents may use which app

**Usable = connection ∩ effective allowlist.** An agent may use an app when the
acting user has an ACTIVE connection AND the toolkit sits inside the agent's
effective allowlist ceiling.

```
effectiveAllowlist = agentCeiling ?? ALL
```

- `null` = unrestricted (ALL), `[]` = none. A new agent defaults to every app.
- **There is no org-wide ceiling.** Removed 2026-07-16 as overengineering: the
  `org_settings` ceiling, the `OrgSettings` wire type,
  `getOrgSettings`/`setOrgSettings`/`useOrgSettings`, and
  `AgentSettings.orgAllowedToolkits` are all gone. **There is no "Allowed
  integrations" tab on the Admin page** — `OrgTabId` is
  `people | activity | usage | billing` (`components/organization/org-view-model.ts`).
- **There is no per-`(user, agent)` GRANTS layer.** The entire grants system (app UI,
  engine-client + adapters, host routes + file/memory stores, and the sandbox
  search-filter / execute 403) was removed. This open host neither reads nor enforces
  grants: the sandbox proxy runs `search`/`execute` UNFILTERED.
- **Enforcement lives in the closed cloud gateway.** It narrows `search` and refuses
  `execute` outside the effective allowlist; when the ceiling **shrinks** it prunes
  now-disallowed toolkits from live connections so revocation takes effect
  immediately, and a per-agent connect carries the agent slug so the toolkit is
  checked on a successful OAuth (`connectIntegration(provider, toolkit, agent?)`).
  Cross-ref `cloud/docs/contracts/C4-grants.md` (itself RETIRED) +
  `C1-integrations-api.md`. Desktop/self-host run this open host with NO server-side
  policy layer — an install with a connection can use the app.

### The ceiling editor

- `getAgentSettings` / `setAgentSettings` read/replace the agent ceiling
  (`allowedToolkits` — the whole effective allowlist — plus the caller's effective
  `access`; manager-only write).
- Rendered through the SHARED `AllowlistEditor`
  (`components/integrations/allowlist-editor.tsx`, i18n-agnostic `copy` prop). The
  per-agent wrapper is `AgentAllowlistSection`
  (`components/agent/agent-integrations/agent-allowlist-section.tsx`), feeding it the
  `teams:integrations.allowlist.*` copy, the WHOLE catalog as the selectable
  universe, and a connected-apps seed. It is the **sole survivor** of the deleted
  per-agent Integrations tab's directory.
- **Exactly one mount**: the canonical agent settings page's **Apps** section
  (`AgentAdminIntegrations` → `AgentAllowlistSection`; the AI-models sibling is
  `AgentAdminModel`). Reached through Team Settings or Settings > Permissions
  ([agent-settings.md](agent-settings.md)).
- The editor's surface is an always-visible two-option choice (`anyLabel` saves
  `null`, `pickedLabel` saves an explicit set; keys `question` / `policyHelper` /
  `anyLabel` / `anyDesc` / `pickedLabel` / `pickedDesc` — `policyHelper` notes that
  members still connect their own accounts) with a per-app allow toggle, not a dense
  checklist. `readOnly` hides "Add apps" and shows a note.

### Where a member sees the ceiling: nowhere

The by-agent LENS went with the per-agent Integrations tab — no screen lists "the
apps this agent may use" from a member's side. What remains is the ceiling EDITOR
(manager-facing) and the gateway (the enforcer). `effectiveAccess`
(`integrations/effective-access.ts`, the pure
`usable | notConnected | blockedByAdmin` resolver) was DELETED with the tab that was
its only consumer; the rule it encoded still holds server-side. The locked-row
transparency surface ("Turned off in your workspace", the ask-your-admin line, the
role-aware "Enable it in Permissions" fix) was removed for the same reason; git
history is its archive, and the concept may return once it has a member-facing home.

**Permissions live in exactly ONE place: Settings > Permissions**
(`app/src/components/permissions/`, settings section id `"permissions"` — a top-level
view until HOU-788). People → which agents each member may use; Agents → what each
agent may use (the app + model allowlist ceilings, mounting the SAME editors).
Everywhere else in the app shows ZERO permission management, ZERO "which agents use
this app" displays, and ZERO blocked/locked rows.

**Stale files are inert.** `<agent>/.houston/integration-grants.json` written by
earlier builds is IGNORED — nothing reads it, no boot migration is needed, and it is
removed for free when the agent dir is deleted.

---

## 2b. Confirming an action — model-driven, no host gate (HOU-885)

- Confirmation before a consequential write is a **model-driven `ask_user`
  question**, rendered by the ordinary question step of the interaction stepper — not
  a host-side gate and not a Composio-aware approval card.
- **The host executes every authenticated execute directly.**
  `/sandbox/integrations/execute` (`routes/integrations-sandbox.ts`) runs the call as
  soon as the sandbox HMAC authenticates it — read or write, every mode.
- **Mode semantics** are purely a prompt/model concern now: in **Ask first** the model
  asks before a consequential write; in **Autopilot** the agent cannot pause on the
  user, so it fires directly. The host does not read the turn mode for integrations.
- Policy that remains, untouched: the Planner cannot act at all (it blocks writes
  upstream), and the gateway's toolkit allowlist still 403s an out-of-allowlist
  execute (§1, §2).
- Deleted: `packages/host/src/integrations/{action-approvals.ts,
  action-approval-store.ts, action-classification.ts, approvals.ts, agent-file.ts}`,
  `routes/action-approvals.ts`, the `actionApprovals` dep on
  `ControlPlaneDeps`/`AgentAuthzDeps`, the `/agents/:id/action-approvals/*` dispatch,
  the fake-host `state-action-approvals.ts` + `routes-action-approvals.ts`, plus
  `ChatApprovalInteractionCard` / the `renderApproval` prop / the three-way
  Always-allow / Deny / Allow-once footer and the `approvedLine` / `deniedLine` reply
  plumbing. The old Always-allow / one-shot-ticket / 15-minute-grant systems went with
  them.
- **Stale files are inert.** `<agent>/.houston/action-approvals.json` records are
  ignored; no migration needed.

### Branded process-block header while an execute runs (HOU-888)

While an `integration_execute` is the current tool, the chat process-block header
reads **"Mission in progress: [logo] Gmail · Sending email"** instead of the raw
`getToolActionLabel` fallback.

- `ui/chat` stays Composio-unaware. `chat-process-header.ts` exposes
  `getCurrentActionTool`, `integrationActionOf(tool)` (short-name
  `integration_execute` AND a non-empty `input.action` → the action slug; tolerates
  malformed input), and `buildProcessHeader` (a `{kind:"brand"|"text"}` union — brand
  only when the current tool is a resolvable execute).
- The brand is supplied by the app through the existing `processLabels` channel:
  `ChatProcessLabels.resolveActionBrand?(action)` + `activeActionPrefix` (the
  localized "Mission in progress:" split from the `{{action}}` template because the
  row interleaves an inline logo). Rendered by `chat-action-brand-line.tsx` (helmet +
  prefix + logo `size-3.5` + `name · actionLabel`, REGULAR weight, shimmer while
  active, logo drops on error).
- App side (`use-action-brand-resolver.ts`, wired in `use-chat-display-labels.tsx`):
  action → toolkit via `toolkitOfActionSlug(action, catalogSlugs)` (LONGEST catalog
  slug prefixing the action, first-segment fallback — `integrations/app-display.ts`)
  → name/logo via the shared `useToolkitBrandResolver` (catalog MISS = prettified
  name, no logo) → present-tense label via `humanizeActionGerund(action, toolkit)`.
- The mission-log ROW stays text-only: `tool-labels.ts` maps
  `integration_execute`/`integration_search` to "Using an app" / "Finding app
  actions" so raw underscores never leak.

---

## 3. UI map

**There is ONE connect surface: the global Integrations page.** The per-agent
Integrations tab was deleted with the rest of the agent tab shell and nothing
replaced it — Composio runs in platform mode, so a connection belongs to the USER,
and a per-agent connect screen was always a lens over a user-level fact. What IS
per-agent is the CEILING (§2). The old `HOST_BUILD` build constant gates nothing; the
runtime gate is `integrationsSupported(caps)`.

### Modules

- **`app/src/components/integrations/`** — the shared module (`index.ts` is the
  surface). Notable exports: `AppDetailDialog`, `AppRow`,
  `IntegrationDisconnectDialog`, the gate/flow hooks, and pure helpers
  `browseCatalog` / `pollConnectionUntilActive`.
  - `model.ts` (DOM-free, node-tested) holds `INTEGRATION_PROVIDER`,
    `integrationsSupported(caps)` (`caps.integrations.length > 0` — the capability
    gate the page and the Settings section share), the poll constants, and
    `createWaker`.
  - **`browse-model.ts`** holds the catalog helpers: `browseCatalog` (filters, then
    sorts ALPHABETICALLY by app name, case-insensitive), `matchesQuery`, `byNameAsc`,
    `categoriesOf` (dropdown options), `categoryLabel` (slug → "Developer tools"),
    `toolkitsInCategory(catalog, category)` (slug set, `null` for "all"),
    `categoryListView` (mirrors the models editor's `allowedListView` — picks a
    category-aware empty string so an empty filtered list never falsely claims the
    surface has no apps), and `UNCATEGORIZED`.
  - `browse-sections.ts` holds `groupCatalogByCategory` + Featured +
    `catalogCategorySlugs`, split off `browse-model.ts` for the file-size line;
    `category-priority.ts` is a further split for the curated ordering list. All
    re-export through the barrel.
  - `AgentChips` went with the grants layer; `CatalogLockedSection`, `splitByGrant`
    and `browseCatalogView`'s `connectable`/`locked` partition went with the locked
    rows.
- **Shared connected-apps read-model** — `useConnectedApps`
  (`integrations/use-connected-apps.ts`) yields sorted `ActiveAppRow`s (WORKING
  connections only) over the pure, node-tested `partitionConnections`
  (`integrations/connected-apps-model.ts`), which also answers `broken` (toolkit → its
  pending/errored connection) and `catalogHiddenToolkits` (the one rule for what the
  browse catalog omits). It carries NO grant plumbing.

### The global page

`app/src/components/integrations-view/`, top-level view
`INTEGRATIONS_VIEW_ID = "integrations-home"` (the `"integrations"` slug belonged to
the per-agent tab id). It is ALWAYS the personal catalog, in every mode — the old
Teams "policy" identity (`integrationsPageMode` / `integrations-view-model.ts` /
`integrations-policy.tsx`) was deleted.

- **Nav gating: none.** The sidebar item, the `workspace-shell.tsx` render branch and
  the tour step are UNCONDITIONAL — visible to EVERY member (the old
  `canSeeIntegrationsPage` gate in `org-roles.ts` was removed). It renders no
  allowlist editor and no locked/blocked row: it is a personal connections lens, and a
  ceiling is per agent.
- **Structure** — a `PageHeader` hero (title + `home.description` subtitle, whose
  count reads the FULL catalog size via `home.descriptionCount`), then the
  **page-level `CatalogModeTabs`** (Composio vs Custom — see
  [custom-integrations.md](custom-integrations.md)) wrapping the generic
  **`CatalogShell`** (`ui/core/src/components/catalog-shell.tsx`: ONE `controls` row
  over an Installed section and an Available section, each under an `lg`
  `CatalogSectionHeader` with a live `CatalogCount` chip).
- **(0) The ONE controls row** (`catalog-controls.tsx` → `CatalogControls`): a
  `CatalogSearchField` (`home.searchPlaceholder`, always-available clear X whenever it
  holds text) + the searchable A-Z category `FilterCombobox`. It sits ABOVE both
  sections and narrows the Installed strip AND the Available tab together. State lives
  in `use-catalog-surface.ts` (`useCatalogSurface({active, catalog, connections})` →
  `tab`, `query`, `category`, `filtering`, `shown`, `installedCount`,
  `availableCount`). A successful connect clears the query only when the landed app
  still matches it, so a later OAuth completion cannot erase a newer search.
  - The category combobox is the shared `components/shell/filter-combobox.tsx` (forced
    `searchable`), options from `catalogCategorySlugs` — A-Z by label with
    `UNCATEGORIZED` pinned last (a lookup-by-name surface orders alphabetically even
    though the page's sections order mainstream-first). Three domains share the
    component now: ai-hub, agent-admin models, integrations.
- **(1) The consolidated Installed strip**, OUTSIDE the tabs (identity, not discovery
  — it never changes with the tab): active catalog connections AND custom
  integrations as a two-column `CatalogGrid` of `CatalogRow`s (`InstalledStrip`), the
  SAME row grammar as the browse catalog — `AppLogo` art (custom rows get letter
  avatars), always-visible name, a one-line description, and an always-visible
  presence-style `StatusDot` LEFT of the name ("● Asana", sr-only status label, via the
  `CatalogRow` `statusDot` slot) so connected state reads on the ROW, not just from
  section placement. A quiet trailing `ChevronRight` marks each row as an
  open-affordance. A catalog row opens `AppDetailDialog`; a custom row jumps to the
  Custom mode.
  - Catalog rows pass `status="active"` literally: both callers keep pending/errored
    connections in the CATALOG (on the app's own row, wearing its status), so the
    amber/red branches were unreachable. Custom rows keep their real status.
  - At rest the grid caps to the shared `CATALOG_INSTALLED_PREVIEW_CAP` (6) behind a
    quiet `CatalogShowMore` "Show all N" expander (`home.showAllApps`); while the
    shared filter is active every match renders uncapped. That split is the ONE shared
    pure helper `installedPreview<T>(items, { searching, expanded, cap })`
    (`app/src/lib/installed-preview.ts`) all three installed strips call
    (integrations, skills, connected providers); the cap is INJECTED, not imported, so
    the module stays free of the `@houston-ai/core` JSX barrel and testable under
    `node --test`.
  - The shared query + category narrow the rows via the pure
    `filterInstalledBy(active, custom, catalog, { query, category })` — category
    narrows first via `toolkitsInCategory`, then `filterInstalled` does the substring
    query; custom integrations carry no category, so any active category excludes them.
  - When the filter leaves NOTHING installed the whole Installed section is OMITTED
    (no heading over an empty list).
- **(2) The Available section** (`home.availableTitle`) whose `availableCount` chip =
  connectable apps matching the shared filter (via `browseCatalog`, minus
  `catalogHiddenToolkits`). **It has exactly ONE tab**, `catalog`
  (`home.tabs.catalog`) → `CatalogBrowsePane` with `surface="integrations"`, so
  `CatalogShell` drops the tab chrome. (The Custom source is the page-level
  `CatalogModeTabs`, not a tab here.)
  - `CatalogPane` is CONTROLLED: it takes `query` + `category` props from the page (its
    own controls row moved UP into `CatalogControls`) and renders the grouped
    `CategoryCatalog`.
  - The connect flow is app-wide shared state (`stores/connect-flow.ts`), so switching
    modes, closing a dialog, or leaving the page never kills an in-flight OAuth poll.

### The browse catalog

`CategoryCatalog` groups the connectable catalog (only WORKING connections are
excluded — a pending/errored one keeps its rows, wearing its status) by primary
category into flat two-column `PlaneAppRow`s.

- **Section order is MAINSTREAM-FIRST**, via the pure `groupCatalogByCategory`
  (`browse-sections.ts`): the curated `CATEGORY_PRIORITY` categories
  (`category-priority.ts` — social-media-accounts, file-management-and-storage,
  spreadsheets, team-chat, team-collaboration, productivity, ai-meeting-assistants,
  ads-and-conversion, notes, signatures; matched via `categoryRank`'s
  spelling-insensitive normalization, `&`→"and", non-alphanumerics dropped;
  `developer-tools`/AI deliberately ABSENT) come first in that order, then every
  remaining category by app-count DESC (label tiebreak), `UNCATEGORIZED` last. Raw
  size ranking would float dev/AI apps above a small curated section, which is wrong
  for a non-technical audience. Each section header carries its count chip.
- **Most used spotlight.** At REST ONLY (no query AND no single-category narrowing) a
  curated `MOST_USED = "__mostUsed"` section (`MOST_USED_SLUGS`: gmail, calendar,
  notion, sheets, slack, twitter, linkedin, whatsapp, instagram…) is pinned FIRST,
  under `t("home.mostUsed")`. Membership is COMMITTED data, deliberately not
  Composio's live usage sort: `GET /api/v3/toolkits?sort_by=usage` exists (verified
  2026-07-22, it is also the default order) but ranks global Composio *developer*
  usage — github/supabase/perplexityai in the top ten. The list stays hand-picked,
  ordered by those apps' relative ranks from that verified data (rank comments in
  `browse-sections.ts`). Most-used apps still appear in their own category sections
  (a spotlight, not a move), already-connected apps drop out, and `MOST_USED` never
  leaks into `catalogCategorySlugs`. A search or category pick suppresses it.
- **Rows** are the split `CatalogRow`: the row BODY opens the app's "more info" modal
  (`app-info-dialog.tsx` over the generic `CatalogDetailDialog` — art, name, category
  `Badge` chips, the FULL description, a Connect CTA), while the GHOST round `+` at
  the right edge (`CatalogAddButton`: full-ink icon, transparent at rest, hover fills
  the circle with the elevated `input` surface) is the ONLY row-level connect. It
  spins while THIS app connects and NEVER disables because another app is connecting.
- **Disconnect is scope `everywhere`** (a user-level connection disappears for ALL
  agents); the confirm names no agents. A connected app's `AppDetailDialog` (from the
  Installed strip) shows info + reconnect + disconnect only.
- Presentational pieces live in `components/integrations-view/`:
  `catalog-controls`, `catalog-pane`, `installed-strip`, `plane-app-row`,
  `category-catalog`, `catalog-category-section`, `app-info-dialog`,
  `connected-app-dialogs` (extracted so `integrations-ready.tsx` stays inside the
  file-size limit), `catalog-skeletons`, `use-catalog-surface`, `use-catalog-sections`
  (the browse plane's derivation: hidden toolkits, capped sections, inline-state
  owners, the broken-connection map).
- **Loading language** is two treatments, all owned by `catalog-skeletons.tsx`:
  `InstalledSkeleton` and `CatalogSkeleton` (category sections mirroring
  `CategoryCatalog`'s `space-y-8` / `mb-3` / `mt-1` rhythm and the real `CatalogRow`
  shape — the `+` AND the `CatalogShowMore` line every capped section resolves with),
  so resolving costs no layout shift. `LoadingState` (`integrations/states.tsx`) is the
  BOOT GATE only, with opacity-only pulsing dots (the old fake 5s `transition: width`
  bar animated layout and lied about progress).
- **Names are never machine slugs** — `appDisplay`'s fallback is
  `prettifyToolkit(slug)` ("googlesheets" → "Googlesheets", "google-sheets" → "Google
  Sheets"). `prettifyToolkit` lives in `integrations/app-display.ts`, not `ui/chat`
  (living in the `@houston-ai/chat` barrel put JSX in the import path of node-tested
  pure code). `appDisplay` is the ONE owner of that fallback, and it is handed the
  toolkit exactly as the agent wrote it — lowercasing first is what turned an authored
  "GoogleSheets" into "Googlesheets".

### Deleted surfaces

- **Settings > Connected accounts — REMOVED entirely.** `connected-accounts*.tsx`
  deleted, the id `"connectedAccounts"` removed from `SETTINGS_SECTION_IDS` (so
  `parseSettingsSection` REJECTS it and a stale deep link can never land), and
  Settings carries NO integrations row at all — a shortcut duplicating the sidebar nav
  was pure chrome. The `settings:connectedAccounts.*` copy block, the
  `nav.connectedAccounts` / `index.rows.connectedAccounts` / `index.values.appsCount`
  keys, and the `home.usedByNone`/`home.usedByAll` chip keys were deleted with it.
- **The per-agent Integrations tab.** `components/agent/agent-integrations/` is down
  to ONE file, `agent-allowlist-section.tsx`. Gone: `agent-integrations-tab.tsx` (+
  its `integrations-tab.tsx` wrapper), `agent-integrations-body.tsx`,
  `agent-integrations-chrome.tsx`, `agent-catalog-sections.tsx`,
  `agent-disallowed-apps-section.tsx`, the directory's `model.ts`
  (`agentIntegrationsView` and the `{activeRows, disallowedRows}` split), and
  `integrations/effective-access.ts`. Three affordances went away rather than moving:
  the tab's own catalog (the global page IS the catalog), the "Not allowed" section,
  and the "Manage all integrations" link whose destination is the page the user is
  already on. **The `integrations:agentTab.*` i18n block is DELETED** — zero keys
  remain.
- **Locked browse rows.** `CatalogLockedSection`, `EnableInPermissionsButton`,
  `LOCKED_PREVIEW_CAP`, the `resolvePermissionsFix` ceiling resolver
  (`integrations/blocked-ceiling.ts` + its test), `splitByGrant`,
  `browseCatalogView`'s partition, the `allowlist` / `lockedFix` prop threads through
  `CatalogPane` → `CategoryCatalog`, and the `integrations:locked.*` /
  `teams:integrations.notAllowed.*` copy. Nothing in `integrations-view/` takes a
  ceiling, so no lock can render. The manager's allowlist editor (`AppCatalogGrid`)
  never used any of it.
- `ConnectMoreAppsSection` / `CatalogBrowser` / `AppCatalogPicker` /
  `ConnectedAppsList` / `recovery-row.tsx` / the per-strip `catalog-search-field.tsx`
  + `use-installed-search.ts`. `AppCatalogGrid` (search + category + load-more grid)
  survives solely inside the allowlist editor, where the category is CONTROLLED by the
  surface so ONE selection also narrows the Allowed list.

---

## 4. The connect flow (HOU-847)

One app-wide flow in three files:

- **`stores/connect-flow.ts`** — the shared state. A module-level
  `connectFlowRegistry` (the render-independent half: waker, cancel flag, redirect
  URL, the run's promise) plus a Zustand store holding `states` (slug → `"starting" |
  "waiting"`, the LIVE phase), `notices` (slug → `"connected" | "failed" |
  "stopped"`, the settled outcome, self-expiring after `CONNECT_NOTICE_MS`), and
  `origins` (slug → the ORIGIN KEY of the row the flow started from).
  - Every consumer observes the same flow: a connect started in chat is visible on the
    Integrations page, and per-toolkit single flight holds GLOBALLY — a second caller
    for the same slug JOINS the running flow via `flowPromise`. `connect()` resolves
    `{ outcome, initiated }`, and only the caller that `initiated` owns the
    starter-side side effects, so the chat card's `integration_connected` analytics and
    its agent nudge fire once per landed connection, not once per card rendered.
  - `cancelAllConnectFlows()` stops every live flow silently and drops the settled
    residue. It is wired to the two IDENTITY changes only — `resetCacheForSpaceChange`
    (`lib/space-cache.ts`) and `signOut()` (`lib/auth.ts`) — because a poll that
    outlives an active-space switch keeps polling with the NEW `x-houston-org` and
    answers for the wrong tenant. **Navigation cancels nothing.**
- **`integrations/connect-flow-run.ts`** — the pure, dependency-injected phase machine
  (`runConnectFlow`), node-tested in `app/tests/connect-flow-run.test.ts`.
  - **Phase order is load-bearing**: `starting` covers ONLY the link mint; `waiting` is
    published after `openUrl` resolves (no surface may claim "we opened {app} in your
    browser" before it did).
  - On `active` it publishes the `connected` notice + toast, DWELLS
    `CONNECT_SUCCESS_DWELL_MS` (900ms) so the row confirms in place, then invalidates
    connections; other outcomes invalidate at once. The settled notice is published
    BEFORE the live phase is cleared (the store reads "a flow ended carrying no
    outcome" as a cancel and retires that slug's origin).
  - The `try` covers the ENGINE half only — mint / open / poll — and `settle` sits
    OUTSIDE it: a rejected `invalidate()`/`announce()` used to be swallowed into a
    `null` return, reporting a landed connection as a failed connect. It is reported
    instead, via an injected `report` dep (`logAndReportError`) that keeps this module
    out of the Sentry/i18n import graph. An engine failure publishes the same `failed`
    notice a provider rejection does, so the row explains the death instead of going
    blank.
- **`integrations/use-connect-flow.ts`** — the thin React binding: real engine calls,
  the store's setters, `announce`. **No unmount teardown**: leaving a surface must not
  kill a poll the user is still finishing in their browser. Only an explicit Cancel
  stops one, and the ~5 min `POLL_MAX_ATTEMPTS` budget caps an abandoned one.

**Parallel by default.** No whole-surface lockout: every row/tile is gated on ITS OWN
slug (`slug in states`), so connecting Slack leaves Notion, the detail modal's CTA,
the onboarding tiles and the email-provider rows fully enabled. `busy`/`disabled`
cross-row props were removed from `PlaneAppRow`, `ConnectStepTile`, and
`EmailProviderRow`.

### Feedback lands where the user clicked

- `ConnectFlowInline` (`integrations/connect-flow-inline.tsx`) renders one app's state
  INLINE — inside the catalog card the pressed row became, or under the intake's
  connect prompt. It is a `role="status" aria-live="polite"` region announcing
  starting → waiting → settled: `waiting.opening` while the link mints, then the
  waiting copy + Reopen / I have finished / Cancel (core `Button`/`AsyncButton`), then
  the outcome line. The old top-of-catalog banner shoved sections ~90px down, far from
  the row that caused it.
- **The owning catalog row IS the card — one box, one spinner.** While a row owns a
  live or just-settled flow, `PlaneAppRow` turns the WHOLE row into one container
  (`rounded-xl border-line bg-input`) enclosing the app header — logo, name,
  description, the `+` slot — and directly below it the flow copy and its pills.
  Nothing is nested: the block renders `variant="bare"` (no frame, no spinner — the
  header's `CatalogAddButton busy` is the ONE spinner, sitting where the user
  clicked). `variant="panel"` is the default and is what the standalone host still
  gets (the routine intake). `hasConnectState(flow, slug)` is the shared predicate
  deciding whether there is anything to dress, so chrome and content appear and leave
  as one.
- **Rows at rest are untouched; the treatment animates on opacity alone.** The card's
  border + fill live on an always-mounted layer behind the row
  (`span.connect-card-frame[data-live]`, `absolute inset-0`), transparent at rest — so
  the catalog keeps its flat transparent-row language and carding cross-fades without
  animating a colour or shadow per frame (`app/src/styles/globals.css`: 200ms
  `entrance` in, 150ms out, per DESIGN.md's motion budget). The content rises in with
  `connect-card-body` (opacity + `translateY`, 200ms; `animation: none` under
  `prefers-reduced-motion`). Only what sits BELOW moves, never the row beside it in
  the 2-col grid. While carded the header's hover fill squares its bottom
  (`rounded-b-none`) and the `+` swaps to `hover:bg-chip`. Covered by
  `integrations-browse.spec.ts` → "the owning row becomes ONE card carrying ONE
  spinner".
- **One panel per hand-off — the ORIGIN KEY** (`integrations/connect-origin.ts`,
  node-tested in `app/tests/connect-origin.test.ts`). The browse catalog renders some
  apps TWICE on purpose (the Most-used spotlight is a spotlight, not a move), so
  "expand the row for this slug" expanded BOTH — two live regions, two rival Cancels.
  Every catalog row now carries `connectOriginKey(surface, section, slug)`,
  `connect(slug, origin)` records it, and `inlineOwners()` hands the expansion to ONE
  row: the row the flow started from, or — when that row is no longer rendered (the
  user searched mid-hand-off) — the first rendered copy, so a live OAuth and its
  Cancel can never vanish. Duplicate rows stay FLAT and keep their compact per-slug `+`
  spinner. Ownership is the HOST surface's call: `PlaneAppRow` gates on `owns &&
  hasConnectState(...)`. `surface` is threaded from `IntegrationsReady`
  (`"integrations"`) — the only remaining caller — through `CatalogPane` into
  `CategoryCatalog`, with per-row ownership resolved in `use-catalog-sections.ts`.
- **The settled line is SHORT; the toast carries the sentence.** Inline reads
  `waiting.connected` ("Connected") / `waiting.failed` ("Could not connect");
  `waiting.stopped` keeps its full sentence because it is the actionable one. The
  settled line itself lives in `integrations/connect-notice-line.tsx` so a surface can
  render an outcome without pulling in the live-phase block.
- **Outcomes are announced once, from the flow, for every surface** (`announce`):
  `active` → success toast `connectResult.connected`; `timeout` → a NEUTRAL `info`
  toast (walking away from an OAuth is normal behavior, not a crash — it no longer
  routes through `showErrorToast`, which would add a Sentry report and a green "report
  sent" follow-up); `error` → an `error`-variant `addToast`, again no auto bug report;
  `cancelled` → silent.

### A broken connection lives where the app lives

A connect that never landed used to REMOVE its app from the catalog and
re-materialize it as a `RecoveryRow` + `PendingConnectionCallout` pinned above the
sections — press Slack in Team chat, OAuth fails, Slack teleports to an unrelated
spot. Both files are DELETED. The rules now:

- **One home per app.** `partitionConnections` sends only `active` connections to the
  Installed strip; everything else stays connectable. `catalogHiddenToolkits(connections)`
  is the ONE rule for what the browse catalog omits and has exactly one clause: a
  WORKING connection. A pending/errored connection keeps its normal category rows,
  spotlight duplicates included, and counts as available. A toolkit holding an active
  connection AND a leftover broken one is installed only.
- **At rest the row says it.** `PlaneAppRow` takes `status?: BrokenStatus` and swaps
  its blurb for the shared `ConnectionStatusBadge` (dot + label, `status.pending`
  "Finishing up" in warning, `status.error` "Needs reconnecting" in danger) on the ONE
  secondary line — which is why `CatalogRow.description` takes a node (inventory v35).
  No expanded panel, no extra chrome.
- **The `+` IS the retry.** It starts the normal connect from THAT row (origin = the
  clicked row). A live flow OUTRANKS the at-rest status everywhere (`hasConnectState`,
  states OR notices): while a flow or its settled notice is on screen the row reports
  that, never both, and the status line returns when the notice expires.
- **Remove lives in the dialog.** The row body opens the SAME `AppInfoDialog` a
  connectable app opens (one dialog per app, never a third surface); for a broken app
  it wears the status chip, leads with `pendingRecovery.body` / `errorRecovery.body`,
  and its footer is Finish connecting / Reconnect beside Remove, which disconnects the
  half-made connection with no confirm (there is nothing working to lose).
  `AppDetailDialog` stays the CONNECTED app's modal.
- e2e: `packages/web/e2e/integrations-recovery.spec.ts` (status on the row, no
  recovery pile above the catalog, the `+` reconnect as one card, the dialog's
  Reconnect + Remove), seeded via the fake host's
  `/__test__/integrations-connection` `{toolkit, status}` hook. It runs on the global
  page alone now, as does `integrations-ia.spec.ts`;
  `integrations-locked.spec.ts` was deleted outright.

---

## 5. Agent-initiated connect (in-chat)

When an agent needs an unconnected app it calls the integration-gated
`request_connection` tool — it never writes a link.

- That records a `{kind:"connect", toolkit, reason?}` pending interaction which rides
  the turn's clean `done` frame and settles the board card to `needs_you`. The pending
  interaction renders a `ChatInteractionCard` stepper that REPLACES the composer while
  pending (HOU-870, `composerOverrideMode: "replace"` — one text input on screen;
  dismissing restores the composer). Its connect step is
  `ChatConnectInteractionCard`.
- **Every step kind composes ONE shared modal shell** — `InteractionModal` +
  `InteractionModalTitle` in `ui/chat` (reference "Coworker card", inventory v19) —
  which owns the surface, the HEADER row (title left; `‹ N of M ›` pager + dismiss X
  top-right), the body, a right-aligned FOOTER row, and an optional trailing region.
  There is no more headerless-body + `InteractionFooter` split.
- Connect, sign-in and credential steps carry a free-text row (`InlineTextRow`,
  ui/chat) in that trailing region below their action buttons: submitted text records
  a decline-with-instruction the agent hears in the composed reply. Question steps have
  their own in-body escape field (`FreeTextRow`), suppressible via `hideFreeText`.
- The connect step's `(icon) ACTION` title (AppLogo `sm` beside "Connect {app}" at
  REGULAR weight — the sign-in step seats the Houston helmet + "Houston" in the same
  slot) sits in the header beside the pager/X; its body is the agent's reason in
  foreground tone (the connected state swaps it for a calm check + "Connected"). The
  signin/connect body renders its OWN `InteractionModal`, wired with the `StepChrome`
  (`{ pager, onDismiss, dismissLabel, disabled }`) the stepper hands it, so ui/chat
  stays auth/Composio-unaware.
- **Weight is restrained**: colour tone carries the hierarchy, so titles and labels are
  REGULAR, never bold.
- Footer is the unified "Not now" + Esc hint beside the single filled "Connect" pill
  (with a return-key glyph). Enter fires Connect, Esc declines (a capture-phase handler
  pre-empting the global Escape-closes-panel shortcut). Navigation is the header pager
  for every kind — no card-inside-a-card, no body nav button.
- **Every step is SKIPPABLE, and a skipped signin/connect step is RECONSIDERABLE**:
  walking Back onto it reoffers its filled CTA, so the user can connect after all (a
  COMPLETED step shows the calm connected state with no footer). A skip is a recorded
  fact the completed reply states ("Skipped connecting {app}." / "Skipped signing
  in.", `chat:interaction.skipped*`) so the agent hears the decline instead of
  re-requesting — UNLESS the step was reconsidered, in which case the reply derives
  each step's FINAL outcome and reports "Connected {app}." instead (the panel keys a
  per-step outcome map read at completion via `finalConnectNames`; ui/chat's
  `StepFooterApi` is `{ revisited, onSkip }`).
- It shares the connect flow with the inline link card through one hook
  (`app/src/components/use-integration-connect.tsx`); only presentation forks. Both
  render the logo through the shared `AppLogo` (the hook holds the favicon-guess
  fallback until the toolkits catalog settles, and `AppLogo`'s failure latch is keyed
  to the failing URL — a pre-catalog 404 once permanently shadowed the real Composio
  logo in production). Both auto-continue the conversation once OAuth lands.
- The old `#houston_toolkit=` markdown-link connect hack is GONE from the prompt and
  tool guidance; the app's legacy link-card renderer survives only to render old
  transcripts. Full lifecycle → [architecture.md](architecture.md).

**No silent failures.** All engine mutations route through `call()`
(`app/src/lib/tauri.ts`), which toasts + reports once, so the integration hooks carry
NO `onError` (a second toast would double up).
