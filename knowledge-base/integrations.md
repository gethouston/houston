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
  lights it up here with zero further work.
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
- the **org** editor is the global Integrations page's policy mode (Teams
  owner/admin), copy `teams:integrations.orgAllowlist.*` (see §3);
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
SEPARATE concept and live in ONE place only — Settings > Connected accounts (§3),
never this ceiling editor. Full client surface: `knowledge-base/teams.md`.

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
consume it verbatim — no forked copies. Notable exports: `ConnectMoreAppsSection`
(the always-visible catalog block, below), `AppDetailSheet`, `AppRow`,
`AgentChips`, `PendingConnectionCallout`, `IntegrationDisconnectDialog`, the
gate/flow hooks below, and pure helpers
`browseCatalog`/`splitByGrant`/`pollConnectionUntilActive`. `browseCatalog` sorts
results ALPHABETICALLY by app name (case-insensitive) after filtering.
`integrationsSupported(caps)` (`model.ts`, `caps.integrations.length > 0`) is the
capability gate the Settings section and the page share.

**Shared connected-apps read-model** — `useConnectedApps`
(`integrations/use-connected-apps.ts`) yields `ActiveAppRow` / `RecoveringAppRow`
plus `editableAgentIds: ReadonlySet<string>` (the per-agent-editability set that
REPLACED the old `canEdit` boolean, computed from `canEditAgentGrants`) over the
pure, node-tested helpers `toolkitAgentIds` / `agentChipsFor` /
`partitionConnections` (`integrations/connected-apps-model.ts`). Both grants
surfaces (Settings and the personal page's detail sheet) read it verbatim. The
shared `AllowlistEditor` (`integrations/allowlist-editor.tsx`) is the one
presentational allowlist editor behind BOTH ceilings (§2).

**Always-visible catalog** — `ConnectMoreAppsSection` (wrapping the internal
`CatalogBrowser`) is a permanent "Connect more apps" section on BOTH surfaces, not
a dialog: a brand-new user with zero connections immediately sees the full ~1000-app
catalog. Apps list A-Z; a search box filters; "Load more" pages. It excludes
already-connected toolkits (surfaced by the caller's own grids) and renders the
`ConnectWaitingPanel` inline for an in-progress OAuth. There is NO add-apps dialog
anymore (`AppCatalogPicker` was deleted).

**Category filter (all surfaces)** — `AppCatalogGrid`'s control row is `search
flex-1` + a category combobox (the shared `FilterCombobox`, moved to
`components/shell/filter-combobox.tsx` now three domains use it: ai-hub,
agent-admin models, integrations; category options carry no `mark`). Category is
CONTROLLED by the surface (threaded `AppCatalogGrid` → `CatalogBrowser` →
`ConnectMoreAppsSection`), so ONE selection filters every list on the surface, not
just the browse grid: the personal page's Connected grid, the agent tab's usable /
disallowed grids, and the allowlist editor's Allowed list all narrow to
the picked category (pure VIEW filter composing with the catalog's text search;
"All categories" resets). Pure helpers in `integrations/model.ts` (node-tested):
`categoriesOf` (options), `categoryLabel` (slug → "Developer tools"),
`toolkitsInCategory(catalog, category)` (slug set, `null` for "all"), and
`categoryListView` (mirrors the models editor's `allowedListView` — picks a
category-aware empty string, e.g. `integrations:home.connectedNoneInCategory` /
`agentTab.empty.category*` / `teams:integrations.allowlist.allowedEmptyCategory`,
so an empty filtered list never falsely claims the surface has no apps).

**Global page (role-aware)** — `app/src/components/integrations-view/`, top-level
view `INTEGRATIONS_VIEW_ID = "integrations-home"` (NOT `"integrations"`, which is
the per-agent tab id — a shared slug would shadow the tab; like `dashboard`/`settings`
a top-level view lives OUTSIDE `STANDARD_TAB_IDS`). `integrations-view.tsx` splits
its ready state on `integrationsPageMode(capabilities)` (`integrations-view-model.ts`:
`"policy"` iff `multiplayer && teams`, else `"personal"`).

- **Nav gating.** The sidebar nav item (`shell/sidebar.tsx` → `sidebar-chrome.tsx`),
  the `workspace-shell.tsx` render branch, and the tour step all gate on
  `canSeeIntegrationsPage(caps)` (`org-roles.ts`): a Teams **plain member** → false
  (the page disappears for them); owner/admin, non-Teams, and single-player → true.
- **Policy mode** (Teams owner/admin) — `integrations-policy.tsx`, the org-wide app
  allowlist editor over `useOrgSettings` / `useSetOrgSettings` (§2), rendered with the
  shared `AllowlistEditor`. Owner edits (`canEditOrgSettings` in `org-roles.ts` =
  owner only); an admin sees it READ-ONLY with the `teams:integrations.orgAllowlist.ownerOnly`
  note ("Only the workspace owner can change this."). Copy: `teams:integrations.orgAllowlist.*`
  + `integrations:policyPage.*`. A footer deep-links to Settings > Connected accounts
  (the deep-link contract below). NO connected grid and NO catalog in policy mode.
- **Personal mode** (single-player / non-Teams) — the page as before: **Connected
  apps** (a two-column grid of cards, each opening `AppDetailSheet`; pending/errored
  connections shown full-width above the grid for recovery; omitted entirely at zero
  connections) then the always-visible **Connect more apps** catalog. Disconnect is
  scope `everywhere` and names affected agents. EXCEPTION: the `AppDetailSheet` renders
  its per-agent grant toggles only when an `onToggleAgent` prop is passed, and this page
  passes NONE — grant editing moved out (to Settings > Connected accounts, below).

**Settings > Connected accounts (all modes)** — the account home for every user,
`app/src/components/settings/sections/connected-accounts*.tsx`, section id
`"connectedAccounts"` (`app/src/lib/settings-sections.ts`, parsed by
`parseSettingsSection`; the store's `settingsSection` deep-link pin is typed
`SettingsSectionId | null` against it). Gated on `integrationsSupported(capabilities)`; a row in the
first settings card carries an app count. Contents: recovery callouts, the user's
connected apps (one-column, agent chips), the disconnect dialog (scope `everywhere`,
affected agents), and THE one grants surface — `AppDetailSheet` with per-agent
`Switch`es via `useAgentGrantToggle` (`app/src/hooks/queries/use-agent-grant-toggle.ts`,
relocated out of `integrations-view/`), each row editable per `editableAgentIds` (from
`canEditAgentGrants`). The connect-more affordance is chosen by the pure `connectAffordance`
(`settings/connected-accounts-model.ts`): a link to the Integrations page while it still
hosts a catalog (non-Teams), else a hint pointing at the agent tabs. **Deep-link contract:**
a producer calls `useUIStore.setSettingsSection("connectedAccounts")` + `setViewMode("settings")`;
`settings-view.tsx` consumes it ONE-SHOT (reads the pending section, then clears it).

**Agent tab (pure connect surface)** — `app/src/components/tabs/agent-integrations/`
(`integrations-tab.tsx` re-exports the orchestrator). Activate/deactivate GRANT
affordances are GONE from this tab (grant editing lives only in Settings > Connected
accounts): `AgentAccountAppsSection` was deleted, and the `grants`-mode view is now
`{activeRows, disallowedRows}` (no `accountRows` / `grantedToolkits`). The view is
still a discriminated union: `grants` mode shows **Apps this agent can use** +, when
non-empty, the disallowed section; `degraded` mode (grants `null`) shows all connected
apps usable with no toggles. Recovery **Remove** now DISCONNECTS in both modes. Both
end with the always-visible **Connect more apps** catalog; connect still auto-grants
to this agent (`useConnectFlow` `autoGrant`), and the disallowed section + locked
catalog rows are unchanged (§2, "Locked browse rows"). The bottom link routes on
`canSeeIntegrationsPage`: `integrations:agentTab.manageAll` ("Manage all integrations")
→ the Integrations page when the caller can see it, else `integrations:policyPage.manageAccounts`
("Manage your connected apps") → Settings > Connected accounts (via the deep-link contract).

**Locked browse rows (Teams only).** On a Teams host with a real effective
allowlist, the browse catalog no longer FILTERS blocked apps out (which read as
"Houston doesn't support X"); instead the agent tab passes the effective
`allowlist` down through `ConnectMoreAppsSection` → `CatalogBrowser` →
`AppCatalogGrid`, which calls the pure `browseCatalogView` (`integrations/model.ts`)
to split the filtered+A-Z catalog into `connectable` (inside the ceiling,
paginated as before) and `locked` (outside it). Locked apps render via
`CatalogLockedSection`: read-only `AppRow`s with a `Lock` trailing icon and the
`integrations:locked.askAdmin` subtitle ("Ask your admin to enable {app}", visible
at rest — no hover gating), under a muted `locked.heading`, capped at
`LOCKED_PREVIEW_CAP` (8) with a `locked.more` "+N more" count line so a tiny
allowlist over the ~1000-app catalog can't bury the connectable apps. A member
SEARCHING for a blocked app finds its locked row (search filters before the
partition), never emptiness. `allowlist === null` (single-player, or Teams with no
ceiling) → `locked` always empty → no locks ever; the global integrations page and
the manager's allowlist editor pass no `allowlist`, so they are unchanged.

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
connect step is `ChatConnectInteractionCard` — a COMPACT left-aligned identity
lockup (reference "Coworker card" look, reversing the earlier centered hero): the
app's brand logo (AppLogo `sm`, size-6) inline with a bold title (the agent's
reason, else "Connect {app}?"; the sign-in step seats the Houston helmet in the
same slot and titles with the reason or "Sign in to Houston"), one muted benefit
line beneath (the connected state swaps it for a calm check + "Connected"). The
footer is a quiet "Not now" + Esc hint beside the single filled "Connect" pill
(with a return-key glyph); Enter fires Connect, Esc declines (a capture-phase
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
badge, the stepper draws a surface-less compact lockup + footer CTA. Both render the logo
through the shared `AppLogo` (the hook holds the favicon-guess fallback until
the toolkits catalog settles, and `AppLogo`'s failure latch is keyed to the
failing URL — a pre-catalog 404 once permanently shadowed the real Composio
logo in production). Both auto-continue the conversation once OAuth lands (or
the app is already connected). The old `#houston_toolkit=` markdown-link
connect hack is GONE from the prompt and tool guidance — the app's legacy
link-card renderer survives only to render old transcripts. Full lifecycle →
`knowledge-base/architecture.md`.

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
`custom-integrations.json` (definitions, next to credentials.json) +
`custom-integration-secrets.json` (0600, values keyed `ci_<slug>_<var>`) are the
durable truth. `CustomExecutorHost` lazily builds one in-memory executor and
rehydrates every definition into it (addSpec/addServer + an org/`default`
connection per def); a definition that fails to compile degrades to state
`error` for itself only. Secrets reach requests via a Houston
`CredentialProvider` (`secrets.ts`) resolved lazily — the executor never copies
values. `CustomSecretStore` is a port: a cloud adapter can move custody to
encrypted Pg / a secret manager without touching anything above it.

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
interview prompt; the in-chat credential card mirrors the connect card
(auto-continue on save). Hidden when the host 404s the definitions route
(engine-client returns `null`, same convention as grants).

**Cloud caveat**: pods store definitions on their own disk; the gateway only
proxies agent-scoped routes, so the cloud web client cannot reach
`/v1/integrations/custom/*` until the gateway allowlists it (same story as the
skills marketplace, PR #706). Desktop/self-host are fully served.

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

### UI surfaces — the Reactions tab

Event-driven automations are their OWN tab, **Reactions** (tab id `reactions`,
es "Reacciones", pt "Reações"), beside Routines and shown only when
`capabilities.triggers` is on (gated in `visibleAgentTabs`,
`app/src/agents/standard-tabs.ts`). There is NO wake-mechanism toggle — the
product decision is one concept per tab: Routines = "on a schedule", Reactions
= "when something happens". The domain model stays ONE `routines.json` list;
both tabs are filtered views over it, thin wrappers over the shared
`RoutineListTab` (`app/src/components/tabs/routine-list-tab.tsx`,
kind-parameterized: filters the list, picks labels, omits the timezone bar for
Reactions, enables trigger data fetching only there).

`RoutineRowEdit` takes `variant: "schedule" | "event"` fixing the ONE wake
mechanism it authors (built-in `ScheduleBuilder` vs the app-injected trigger
editor slot); rows derive the variant from `routine.trigger`. `ui/` cannot
reach app data, so the app injects the editor as a slot —
`RoutineTriggerEditor` (`app/src/components/tabs/routine-trigger-editor.tsx`)
owns the pick-an-app → pick-an-event → fill-the-details flow over
`TriggerPicker` / `TriggerConfigForm` (the config form is generated from the
trigger type's JSON-schema); usable apps are scoped to the agent's granted
toolkits (`use-usable-toolkits`). The live `TriggerStatusBadge` renders above
it; a `paused_disconnected` reaction offers one-click reconnect. Creation
mirrors Routines exactly: "With AI" (the same setup-chat flow with a
reaction-specific kickoff, `reaction-chat-prompts.ts`) or "Manually" (inline
draft card). Draft chats are kind-discriminated by a second agent-mode
sentinel (`REACTION_SETUP_AGENT_MODE = "houston:reaction-setup"`) so a
reaction draft never leaks into Routines and vice versa. Read queries:
`useTriggerTypes` / trigger-status in `app/src/hooks/queries/use-triggers.ts`,
gated on the `triggers` capability so a desktop build never fetches.
