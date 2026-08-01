# Teams (multiplayer orgs) — the open-repo client surface

The client side of Houston Teams: how the open repo (`app/`, `ui/engine-client`)
renders orgs, roles, per-agent access, sharing, and the org dashboard.

> **The gateway is the sole enforcer.** Every gate in this doc only HIDES an
> affordance the caller can't act on. The private cloud gateway classifies each
> request (use vs configure), clamps access to the org role, and 403s anything
> a role/access level isn't allowed to do — the client NEVER re-clamps and a
> stale/spoofed field can't widen power. Server contracts:
> `cloud/docs/contracts/C3` (roles/assignments, v2 matrix), `C4` (grants +
> effective allowlist), `C7-teams.md` (the v2 layer).
> Wire surface: `cloud/INTEGRATION.md`.

Everything here is **capability-gated**: absent/single-player hosts (desktop,
self-host, legacy engine) never mount any of it, and the org routes
404 → the reads degrade to `[]`/`null` silently.

> **Test it locally with `pnpm dev`** — the web pane (:1430) runs the full
> multiplayer surface against the local Go gateway with real Google sign-in
> and engines as local processes (`dev-loop.md`). The kind loop is only for
> pod/PVC/NetworkPolicy fidelity before a release.

---

## Feature detection

Two flags on `/v1/capabilities` (`Capabilities` in `ui/engine-client`):

- **`multiplayer?: boolean`** — this deployment runs in org mode (members,
  roles, assignments). Absent/false = single personal workspace. Every gate in
  `app/src/lib/org-roles.ts` short-circuits to "single-user owns everything"
  when this is off.
- **`role?: OrgRole`** — the caller's own org role, present when `multiplayer`.
- **`teams?: boolean`** — feature-detect for the v2 surface (per-agent access
  levels, share dialog, org dashboard). Absent/false on hosts predating Teams.
- **`spaces?: boolean`**: feature-detect for the C8 Spaces surface
  (multi-membership, the space switcher, self-serve team creation, agent moves,
  seat billing). Absent/false on desktop/self-host, where the switcher's create
  action stays "create a local workspace". Read via `hasSpaces(caps)`
  (`app/src/lib/org-roles.ts`). See the **Spaces** section below.

Optional so every existing single-player/self-host profile stays valid.

> **`role` is per active space (C8).** Under Spaces a user belongs to MANY orgs,
> and `caps.role` is the caller's role in the *currently active* space, not a
> single lifelong role. Capabilities MUST be re-fetched on every space switch;
> the switch drops the whole query cache, so capabilities (and `role`) reload
> under the new space automatically (see **Spaces > The switcher**).

---

## Roles and access levels

Two orthogonal axes. **Org role** = authority in the org; **agent access** =
authority on one shared agent.

- **`OrgRole = "owner" | "admin" | "user"`** — UI labels **Owner / Manager /
  Member**. `owner` is the single billing/root seat; `admin` manages members +
  agents; `user` is a plain seat that can only use assigned agents.
- **`AgentAccess = "manager" | "user"`** — per-agent, on
  `gateway.agent_assignments`. `manager` may reconfigure the agent
  (instructions, skills, model, allowed apps, assignments); `user` may only use
  it. Owner is always `manager` on every org agent.

Key v2 shifts from the old C3 matrix (`app/src/lib/org-roles.ts` header records
them): the admin **"see/manage all agents"** rule is **GONE** — an admin only
sees agents assigned to them, and is only an agent-manager where their effective
`access === "manager"`. Per-agent authority is the `access` level, not mere
assignment.

---

## Role matrix v2 — `app/src/lib/org-roles.ts` + `app/src/lib/agent-access.ts`

Pure, DOM-free, unit-tested. Split by shape: the **caps-only** org gates live in
`org-roles.ts` (`app/tests/org-roles.test.ts`); the **per-agent authority** gates
that also take `Pick<Agent, "access" | "assigned">` live in `agent-access.ts`
(`app/tests/agent-access.test.ts`). All take `Capabilities | null`.

- `isMultiplayer(caps)` — `caps.multiplayer === true`.
- `orgRole(caps)` — the role, or `null` off-multiplayer. A missing role on a
  multiplayer host is treated as the least-privileged `user` (never widens).
- `canCreateAgents(caps)` — owner/admin (single-player: always). Sidebar "New
  Agent" is gated on it via `useCanCreateAgents`.
- `canSeeMembers(caps)` — owner/admin. Also the exact gate for the org
  dashboard (`canSeeOrganization` delegates to it).
- `canManageMembers(caps)` — **owner only**; admins see the roster read-only.
- `isAgentManager(caps, agent)` — (`agent-access.ts`, with the four gates below)
  the single per-agent authority gate:
  single-player true; org owner true; else `agent.access === "manager"`. It
  trusts `access` verbatim because the gateway already clamps a stale `manager`
  row for a `user` member before it reaches the wire.
- `canEditAgentConfig = isAgentManager` — semantic alias for config-edit call
  sites (instructions / skills / model / Agent Settings).
- `canManageAssignments(caps, agent)` — same gate; behind the Share block.
- `canManageAgentGrants` / `canEditAgentGrants` — per-agent integration grants,
  gated on the caller's own assignment (independent of manager authority; see
  `integrations.md`).
  (The global **Integrations page** has NO role gate; it's the personal catalog
  for EVERY member in every mode, and org-blocked apps still render as locked rows.
  The old `canSeeIntegrationsPage` gate was removed with the Teams policy mode.)
- `canSeeAiModelsPage(caps)` — the gate for the global **AI Models hub** (sidebar
  nav, render branch, tour step), which is also where each connected account's
  usage renders (HOU-789): **TRUE for everyone, always** since HOU-976. It used
  to be owner/admin-only in Teams, on the premise that AI provider connections
  were org-level and a member therefore had no account to connect. That premise
  is gone: in a team space every turn runs on the AI account of the person who
  sent it, so a member's own account is the ONLY thing that can answer them and
  the hub is the only surface where they connect it. No role could connect one on
  their behalf, which is why there is no owner/admin half left to gate. See
  **Per-user AI accounts** below. (There is still no org-wide model ceiling;
  model policy is per agent, in the **Permissions** view's per-agent detail (its
  AI Models tab), below.)
  Opening the hub widened nothing else. The usage on a hub card is the VIEWER's
  own account, and the space-wide roll-up lives in **Settings > Admin > Usage**,
  still behind `canSeeOrganization` (owner/admin, team space) — the two were
  never one gate after HOU-788 moved Admin into Settings. **No role carries
  AI-credential authority in a team space**: owner, manager and member are
  identical there, because each can only ever address their own account.
- **Settings > Time worked is NOT behind that gate** (HOU-790). The old Usage
  screen inherited `canSeeAiModelsPage` because it carried the org-level provider
  accounts; what is left is only the per-agent running-time analytics, so it
  rides `capabilities.computeUsage` (`showTimeWorked`). A plain member of a
  hosted-cloud team therefore NEWLY sees that section. Deliberate and safe: the
  gateway scopes `GET /v1/org/compute-usage` to the agents the caller can already
  reach, so a member sees their own agents' time and nothing else. If that server
  scoping ever narrows or widens, revisit this gate with it.
- `GRANTABLE_ROLES = ["admin", "user"]` — owner is never handed out from the UI
  (ownership transfer is out of scope for v1).

---

## Admin page (the org dashboard)

**Settings > Admin** (`org.title`; "Admin" / "Administración" / "Administração"),
a SETTINGS SECTION since HOU-788 — it had its own sidebar entry before, and
`ORGANIZATION_VIEW_ID` / `organization/id.ts` are gone with it. The section id is
`"organization"` in `app/src/lib/settings-sections.ts`; the dir
(`app/src/components/organization/`) and the gate are unchanged. Rendered only
when `canSeeOrganization(caps, activeSpaceIsTeam)` (multiplayer owner/admin,
AND — on a Spaces host — a TEAM active space). The Settings index row and
`SettingsView`'s blocked-section fallback both guard on it, so it never
mounts for a plain member, single-player, or in the personal space of a Spaces
host. `OrganizationView` takes `backLabel`/`onBack` from `SettingsView` so there
is exactly ONE back bar at each depth.

**Personal space hides Admin + Permissions (HOU-824).** On a C8 Spaces host the
personal space is single-player semantics: non-invitable (the gateway 403s a
member-add with `personal_space`), no roster, no policy. So Admin and Permissions
are TEAM-space surfaces there — `canSeeOrganization` returns false whenever the
active space is personal (`!isTeamWorkspace(current.id)`), whatever the role. The
ONE hook, `hooks/use-surface-gates.ts` (`useSurfaceGates`), derives
`activeSpaceIsTeam` from the active workspace id and returns
`{ showOrganization, showAiModels, ready }`; the sidebar, the workspace shell,
the blocked-app CTA and `SettingsView` all read it, so a gate can never be
tightened in one place and forgotten in another. `showOrganization` gates the two
Settings index rows, the "Enable it in Permissions" CTA (it must use the
DESTINATION's gate, not the looser `canSeeMembers`), and the fallback that drops
a stale section back to the Settings index. On a non-spaces multiplayer host
(legacy Teams v2, exactly one org) `activeSpaceIsTeam` is irrelevant and behavior
is unchanged.

**`ready` — the gates mean nothing until capabilities land.** They are computed
from `capabilities`, which is `null` while the query is in flight, so an
unresolved gate is indistinguishable from a denied one. Anything that merely
HIDES an affordance can act early; anything that DROPS an open surface must wait.
`SettingsView` routes through `settingsSectionGate(section, {…, ready})`
(`lib/settings-sections.ts`), a tri-state `loading | blocked | visible`: a gated
section holds its place behind a back bar + spinner while `ready` is false, and
only a RESOLVED block falls back to the index. Without it, every team-space
switch dumped an owner out of an open Admin/Permissions section, because
`resetCacheForSpaceChange` removes the capabilities query and the next render
sees `null`. `blockedSettingsSection` is the inner rule and must not be called
directly by a view.

**Now membership + insights + billing ONLY.** All policy (per-agent access and
per-agent ceilings) moved OUT to **Settings > Permissions** (next section; it was
briefly a top-level sidebar view, and became a settings section in HOU-788). The
Admin page is what remains: who's in the org, what they're doing, and the bill.

**Index/detail grammar (settings-page style), NOT a tab strip.** The landing
screen is `admin-index.tsx`: grouped, self-describing rows (`SettingsCard` /
`SettingsRow` reused from `components/settings/settings-row.tsx`), each with an
icon, a title (`teams:org.tabs.<id>`), a one-line description
(`teams:org.index.rows.<id>`), and an at-a-glance value chip
(`teams:org.index.values.*`: member count). Groups: a **People** card
(membership), an **Insights** card (Activity, Usage), and a **Billing** card
(when in scope). The old **Permissions** group (Agents, Allowed apps, Allowed AI
models) is GONE — it now lives in Settings > Permissions. Clicking a row opens its
detail screen: a back bar (label `org.title`) + a `PageHeader` section heading +
the section body at full width — all sections render on the generic `{ ctx }`
path now (the Agents + member drill-in special-casing in `admin-section-detail.tsx`
is gone). Deep links (org-nav-store `requestedTab`, only Billing from the
team-status banner now) open the detail directly; when the visible set drops the
active section, the view falls back to the index.

Section set (order fixed by `orgTabIds` in `org-view-model.ts`):
`OrgTabId = "people" | "activity" | "usage" | "billing"`,
`ORG_TAB_IDS = ["people","activity","usage"]`, and `orgTabIds({ billing })` appends
**Billing** conditionally last (see the Spaces billing section). The old `policy`
gate + `POLICY_TAB_IDS` are GONE. `organization-view.tsx` is a thin index/detail
shell — it loads `GET /org` once, builds the shared `OrgViewContext`
(`{org, role, isOwner}`), and each section owns its data + UI. It no longer plumbs
`detailAgentId`/`detailMemberId`/`requestedAgentId` or loads `useOrgSettings`.

- **People** (`members-tab.tsx` / `people-roster.tsx`) — roster + pending invites,
  **membership only**: owner mutates (add/remove/re-role, revoke invite); admin sees
  those read-only. The roster row is NO LONGER a drill-in (`onOpenMember` removed) —
  agent access is managed per agent in Settings > Permissions (each agent's People tab).
  This is still the ONLY
  membership surface: the old Settings > Members section (and the whole `org` i18n
  namespace it used) was deleted as a duplicate; "members" is no longer a
  `SettingsSectionId`.
- **Activity** (`activity-tab.tsx`) — the audit log, paged.
- **Usage** (`usage-tab.tsx`) — per-agent/user message counters.

`org-nav-store.ts` is pruned to Billing only (`requestedTab` + `requestTab` +
`clearRequestedTab`; the old `requestedAgentId`/`requestAgentDetail` are removed) —
only `team-status-banner.tsx`'s Billing deep-link still uses it.
`org-view-model.test.ts` covers the slimmed shape (`ORG_TAB_IDS` = people/activity/
usage; `orgTabIds` only gates billing).

---

## Permissions (Settings > Permissions, the one policy home)

> **Org-wide ceilings REMOVED (2026-07-16, Felipe: overengineering).** Policy is
> managed ONLY per agent. There is no org-wide app ceiling and no org-wide model
> ceiling; the "Defaults for every agent" card, the `OrgSettings` wire type +
> `getOrgSettings`/`setOrgSettings`/`useOrgSettings` chain, and `canEditOrgSettings`
> are gone. A new agent's effective allowlist is its OWN ceiling (`null` = every
> app/model, the default). The gateway-side retirement rides a sibling `cloud` PR.

> **Fully agent-centric (2026-07-16, Felipe: final — supersedes the People/Agents
> top-level split).** There is NO top-level People tab and NO per-person lens. The
> view shows the agent list; opening an agent manages WHO can use it and WHAT it can
> use, across three tabs. The per-PERSON lens (`member-detail*`, `permissions-people-tab`,
> `permissions-agents-tab`, `permissions-people.spec.ts`) was DELETED.

**Settings > Permissions** — everything policy, FULLY AGENT-CENTRIC: pick an
agent, then manage who can use it and what it can use. A SETTINGS SECTION since
HOU-788 (`PERMISSIONS_VIEW_ID` / `permissions/id.ts` are gone): the section id is
`"permissions"` in `app/src/lib/settings-sections.ts`. Gated by
`canSeeOrganization(caps, activeSpaceIsTeam)` (multiplayer owner/admin, and a TEAM
active space on a Spaces host) — the IDENTICAL gate to Admin, threaded through the
same `showOrganization` boolean from `useSurfaceGates`. The Settings index row
(`app/src/components/settings/settings-index.tsx`) is a `ShieldCheck` lucide icon,
label `settings:nav.permissions`, in the "Team" group right AFTER Admin (both
inside the `showOrganization` block, `data-testid="settings-row-permissions"` for
the e2e specs). `settings-section-body.tsx` mounts it with `backLabel`/`onBack`.

`permissions-view.tsx` is a shell: it loads `useOrg(true)` once (roster + role), owns
the drill-in as an `{agentId, tab}` pair (id-not-snapshot so a store reload keeps the
detail on the live row), and renders a `PageHeader` ("Permissions") + the agent list
(`agents-list.tsx`) DIRECTLY — no top-level tab strip. Both levels use the shared
`shell/back-bar-screen.tsx` (`BackBarScreen`): the list level's bar returns to the
Settings index, the agent drill-in's returns to the list ("Permissions").

**Deep-linking** — `permissions-nav-store.ts`: zustand `usePermissionsNav` with
`{ requestedAgentId; requestedAgentTab: PermissionsAgentTab|null; requestAgentDetail(agentId, tab?); clearRequested }`.
The role-aware blocked-app CTA calls `requestAgentDetail(agent.id, "integrations")` so it
lands straight on that agent's Integrations tab (where the app-enable fix lives); the view
consumes the request one-shot (initial mount + while open) and clears it (see the
Integration allowlist ceiling section, Part B).

**Agent detail — three tabs** (`agent-detail.tsx`, takes `{ agent, members, initialTab? }`):
a `PageHeader` (agent avatar + name + "Open agent") over the shared
**`AgentPermissionsPanel`** (`permissions/agent-permissions-panel.tsx`, `{ agent, members,
initialTab? }`): `@houston-ai/core` `Tabs variant="line"` with
**People | Integrations | AI Models** (labels `permissions.agentTabs.{people,integrations,models}`;
`defaultValue = initialTab`, default `"people"`). In the Settings > Permissions drill-in the whole detail is
gated on `isAgentManager(caps, agent)` — a visible-but-not-manager admin gets
`org.agentDetail.managerOnly` instead of the panel.

**Two fronts, one target — the agent's Settings access rows.** The same People,
Integrations, and AI Models sections mount in the per-agent Settings rail. Settings
is visible to everyone on a Teams host; non-managers see those access rows read-only,
while manager-only configuration rows remain hidden. It never exposes access rows on
single-player/self-host, where there are no ceilings or roster.
`agent-admin-screen.tsx` fetches the roster via `useOrg` and renders
`readOnly = !isAgentManager(caps, agent)`; managers get the
fully editable panel right on the agent.

**Read-only rule.** `readOnly` threads through the panel to every section: People rows drop to
static level labels with NO control (`agent-person-row.tsx` `readOnly`, plus a muted
`permissions.agentPeople.readOnlyHint`); the Integrations + AI Models editors use their own
`readOnly` mode (controls disabled, the "Add" list hidden, a muted `readOnlyNote`). No hover
gating anywhere. **Roster degradation for a plain member:** the gateway serves `members` only to
owner/admin (`OrgInfo.members` is absent for org role `user`), so a member's People roster arrives
empty; rather than a misleading "no people yet" empty state the tab shows the honest viewer line
`permissions.agentPeople.viewerOnly` ("You can use this agent. Someone who manages it can change
who has access."). The pure decision is `agentPeopleView(rowCount, readOnly)` in
`agent-people-model.ts` (`"roster" | "viewerOnly" | "empty"`, unit-tested). An admin who isn't the
agent's manager still gets the full roster (they can see members) — read-only. The gateway is the
sole enforcer; `readOnly` only avoids a dead control.
- **People** (`agent-people-tab.tsx`) — WHO can use THIS agent: every org member is a row
  (avatar + email + org-role chip) with a **None / Can use / Manager** control
  (`agent-person-row.tsx`; owner renders static "Owner, always has access"). Read + write
  reuse the Share dialog's roster math (`components/tabs/agent-access-model.ts`) VERBATIM via
  the thin pure model `agent-people-model.ts`: `buildAgentPeople` wraps `buildSharePeople`
  (everyone-agent expands to the whole team, owner is always manager, members off the roster
  read `none`); `writeAgentPerson` wraps `buildSharePeople`+`applyShareAction` (so an
  everyone-agent MATERIALIZES into an explicit roster on first edit exactly as the dialog
  does, and the owner is never stripped); `agentPersonNeedsConfirm` delegates to the dialog's
  `needsSelfLockoutConfirm`. Writes go through `useShareAgent` (optimistic set-replace
  `PUT /v1/agents/:slug/assignments`); a self-lockout is confirm-gated. Manager is disabled
  for org-role `user` members (`canPersonBeManager`, gateway 400s `manager_requires_admin`).
  Copy: `share.levels.*` + `share.ownerAccess`/`share.you`/`share.selfNote` +
  `permissions.agentPeople.*` (the None label/hint + `changeAccess` aria). Unit test
  `app/tests/agent-people-model.test.ts`.
- **Integrations** — the agent's app ceiling (`AgentAdminIntegrations`, heading "Which apps
  can this agent use?").
- **AI Models** — the agent's model ceiling (`AgentAdminModel`, heading "Which AI models can
  this agent use?").

The agent list is `agents-list.tsx` (`{ members, onOpenAgent }`, rendered by the view with
no wrapper — the old `permissions-agents-tab.tsx` wrapper was deleted); helpers
`org-agent-card.tsx` + `org-agents-model.ts` live alongside; `org-roster.ts` + `org-time.ts`
stay in `organization/` (cross-dir import). NO "Defaults for every agent" card — policy is
per agent only. Tested: e2e `packages/web/e2e/permissions.spec.ts` (agent list → three-tab
drill-in; People Can use→No access round-trip; Integrations ceiling round-trip; AI Models
present; PLUS the agent's Settings access rows: a manager's editable round-trip and a
role-`user` member's read-only view + viewer-line degradation) via fake host `/__test__/org`
(multi-member roster + fleet with per-agent `assignments`/`access`; `/v1/org` omits the roster
for role `user`, mirroring the gateway) + `PUT /v1/agents/:slug/assignments`/`settings`.

---

## Share dialog — `app/src/components/tabs/agent-share-dialog.tsx`

Google Drive-style Share sheet for one agent. Lists people with access, each a
**Manager / Can use / Remove** control, plus a member picker to add someone.
Backed by `setAgentAssignments` v2 (`{userId, access}[]`) with an optimistic
store patch + rollback (`use-share-agent.ts`). Pure model
(`agent-access-model.ts`) handles self-lockout confirmation (removing/demoting
yourself). Render gated by `canManageAssignments`; the gateway is the enforcer.

Sharing a **personal** agent has no members to assign, so that path opens the
**share-via-team** pipeline instead (see **Spaces > Share-via-team pipeline**).

The **roster face** of this dialog (one agent, every org member, with a None / Can use /
Manager control) lives in **Settings > Permissions > agent detail > People** (`agent-people-tab.tsx`)
— see the Permissions section above. It shares the roster math in
`components/tabs/agent-access-model.ts` via `agent-people-model.ts`, so access is never
derived two ways; it reuses `share.levels.*`/`share.ownerAccess`/`share.you`/`share.selfNote`
and adds `permissions.agentPeople.*`. (The old INVERSE per-person lens — one person, every
agent — was deleted.)

---

## Spaces (C8: multi-membership, switcher, billing)

C8 turns the old "exactly one org per user" model into **Spaces**. Every user
keeps an auto-bootstrapped **personal space** (free forever, uncapped,
non-invitable) and may additionally belong to any number of **team spaces** (the
paid, per-seat product). A Space **is** an org (same table, same roles); `kind`
is `"personal" | "team"`, derived server-side from `personal_of`. The gateway is
the sole enforcer of every rule here; the client gates below are cosmetic. Server
contract: `cloud/docs/contracts/C8-spaces-billing.md`.

- **Personal space**: the free, always-present org. Sharing NEVER goes through
  it (`403 personal_space` on any member-add/invite/billing route); to share you
  create or move into a team.
- **Team space**: an org with `personal_of null`. Created self-serve; paid per
  seat once a second member accepts (which starts the 14-day no-card trial).

Wire types in `ui/engine-client/src/types.ts` (`OrgSummary`, `OrgInviteSummary`,
`OrgsList`, `BillingSummary`, `BillingCheckout`, `AgentMoveStart`,
`AgentMoveStatus`, `Workspace.kind`). Client methods in `client.ts`: `listOrgs`,
`createOrg`, `moveAgent`, `getMoveStatus`, `acceptInvite`, `declineInvite`,
`getBilling`, `createCheckout`, `createPortal`, plus `setActiveOrg` (the
active-space pin, below).

### The switcher (`org:<slug>` workspace bridge)

C8 rides the EXISTING workspace switcher rather than a new selector.
`GET /v1/workspaces` returns one row per membership: the personal workspace
(opaque id, never `org:`-prefixed, `kind: "personal"`, `isDefault`) plus one row
per team, each `{ id: "org:" + slug, kind: "org" }` where `slug` is `[a-f0-9]{16}`.

> **The adapter merges, not passes through (HOU-881).** The engine-adapter's
> `listWorkspaces` (`packages/web/src/engine-adapter/client/workspaces-mixin.ts`)
> fetches the bridge via `prefConfig()` (gateway in cloud mode, local host
> otherwise) and keeps ONLY the `org:*` team rows, appended after the SYNTHETIC
> personal row — the synthetic `"default"` id is load-bearing for prefs/caches,
> and a local/self-host list (never `org:`-prefixed) stays byte-identical. A
> failed/absent bridge read degrades to personal-only. Until this fix the mixin
> never fetched the bridge at all, so teams never reached the switcher and the
> create-team auto-switch silently no-oped (the C8 flow was unreachable in prod).
> E2E: `packages/web/e2e/spaces-gating.spec.ts` (fake host arms team rows via
> `/__test__/workspaces`).

- **Id grammar** (`app/src/lib/space-id.ts`, pure + unit-tested):
  `orgSlugFromWorkspaceId(id)` returns the 16-hex slug for an `org:*` id, else
  `null` (personal); `isTeamWorkspace(id)` is the boolean. This id alone drives
  everything, so a host that returns no team rows stays byte-identical to a
  single-workspace deployment (no capability flag needed on this path).
- **Pinning the active space** (`setActiveOrg`, `app/src/lib/engine.ts` +
  `HoustonClient.setActiveOrg` in `client.ts`): a team slug pins
  `x-houston-org: <slug>` on EVERY gateway HTTP request and `?org=<slug>` on the
  two SSE routes (`/v1/events`, `/agents/:slug/events`), since browsers cannot
  set headers on `EventSource`. Personal (`null`) sends no header. The value is
  recorded on `window.__HOUSTON_ACTIVE_ORG__` and pushed into the live client in
  place (no rebuild); a fresh/repointed client re-applies it (`applyConfig`), and
  the local host's header-free `/v1/ws` transport ignores it.
- **Switch = scoped cache drop** (`app/src/stores/workspaces.ts` `setCurrent` →
  `resetCacheForSpaceChange`, `app/src/lib/space-cache.ts`): tenant query keys are
  NOT org-scoped (the active space is only a request header), so team A and team B
  collide on the same key. On a REAL space change `setActiveOrg` returns `true`
  and the store `removeQueries` with a predicate that drops every key EXCEPT the
  user-scoped, space-INVARIANT ones (`removeQueries` not `invalidate`, which would
  leave inactive-query data serving the prior space's rows on navigation, a
  cross-tenant flash). Tenant reads (including `capabilities`, whose `role` is
  per-space) refetch clean under the new space; the event stream re-establishes so
  the new `?org=` applies. **Preserved (HOU-907):** `["session"]` and the durable
  onboarding flags (`["onboarding-pending"]`, `["onboarding-completed", uid]`) —
  purging them would flap the App.tsx auth/onboarding gates and re-blank the shell
  mid-switch, and they're identical across spaces (not tenant data). Their roots
  are centralized in `app/src/lib/query-keys.ts` (`session`/`onboardingPending`/
  `onboardingCompleted`) so the predicate references them without importing the
  hooks. A same-space reselect, and every switch on a personal-only host (every id
  maps to `null`), is a no-op. First load pins the active space before the first
  fetches fire (no reset needed then).
- **The switch is IN-PLACE — no splash (HOU-907).** `App.tsx`'s
  `WorkspaceLoading` splash is FIRST-BOOT only: a `bootedRef` latch flips once the
  full boot gate (agents/workspaces/capabilities/onboarding flags loaded) clears,
  and the gate is `!booted && <condition>` thereafter. A switch re-flips
  capabilities + onboarding-flag loading and re-runs `loadAgents`, but the chrome
  is zustand-backed and every pane is skeleton-capable + capabilities-undefined-
  safe, so it transitions in place instead of unmounting the shell. The latch
  resets naturally on an identity change: sign-out drops the session, so
  `<HostedEngineGate>` (which wraps `<App/>`) swaps to the sign-in screen and
  unmounts the subtree — the next identity remounts App with `booted` back at
  false. E2E: `spaces-gating.spec.ts` switches spaces through the real UI.
- **Provider-connection state is PER-SPACE** (`app/src/lib/provider-status-cache.ts`,
  HOU-906). Provider "connected" cards seed from a localStorage snapshot the query
  reset can't reach; that snapshot is now keyed by the active org slug
  (`houston.providerStatusCache.v2.<scope>`, personal ⇒ `"personal"`, resolved
  from `window.__HOUSTON_ACTIVE_ORG__`) so a switch reads the NEW space's own
  snapshot (or none ⇒ loading skeleton). `use-provider-statuses.ts` re-seeds and
  re-probes on a workspace-id change, gating the live probe on the new space's
  agents having loaded (the probe routes per-agent, so it must not fire at the old
  agent under the new org header). The old un-scoped `.v1` key is orphaned + purged.
  A probe now also pins `activeProviderStatusScope()` when it STARTS and discards
  its result if the space changed mid-flight, so a personal probe that resolves
  after a switch can neither paint nor persist under the team's key (HOU-979).
- **Provider ROUTING is space-validated, and refuses rather than guesses**
  (HOU-979, `packages/web/src/engine-adapter/client/provider-routing.ts`). Every
  provider connect/probe goes to a specific agent's runtime; the only space-aware
  source for that id is the adapter's `agentList` (the CURRENT space's last
  `listAgents`). The persisted `last_agent_id` pref is NOT space-aware, so the
  three formerly independent sources (`providerAgentId()`, the raw-pref
  `requireAgentId()`, and the agent STORE read in `claude-login-remote.ts`)
  collapsed onto one: `requireProviderAgentId(ctx)`. Before the list settles,
  writes throw "This space is still loading", the status probe returns `unknown`
  with NO request, and the Claude credential push degrades to the setup runtime
  (space-correct: same central store, same org header). `requireAgentId()` stays
  for routes that genuinely mean the agent the user has OPEN (project files,
  per-agent prefs).
  **`agentList` is a THREE-state machine (`context.ts`), not a nullable list** —
  the distinction is what keeps the guard both effective and non-bricking:
  - `pending` — no list for THIS space yet. Writes refuse, the probe skips.
    **`setActiveOrg` resets to `pending` on a real slug change**, so the guard is
    not first-boot-only: a Connect clicked mid-switch used to route at the space
    just left. Re-pinning the SAME slug (the client rebuild / bearer rotation in
    `lib/engine.ts`) is a no-op.
  - `unavailable` — a list was asked for and could not be had: `listAgents`
    threw (`agents-mixin` notes it, then rethrows so the failure still surfaces),
    or boot resolved no workspace to list agents for and the app called
    `client.noteAgentsUnavailable()`. Routing degrades to the pre-HOU-979
    pref-based path so connect + the picker keep working. Never downgrades a list
    we already have; a later successful `listAgents` restores strict validation.
  - `known` — the space's own ids; the pref is validated against them.

  `GET /v1/catalog` deliberately does NOT send `x-houston-org`: the gateway's
  catalog handler ignores the request entirely (one global snapshot,
  `cloud/internal/edge/catalog.go`), so the header buys nothing and newly exposes
  a 403 from `ResolveOrg` on a stale slug — which would pin the picker at
  "Loading providers…" forever through `useProviderCatalog`'s `isSuccess` gate.
- **One provider-connection derivation** (`app/src/lib/provider-connection.ts`,
  HOU-979). `unknown` used to mean opposite things per surface: invisible to the
  chat picker's catalog, "Connected" to the AI hub's badge, "card never clears"
  to the in-chat reconnect card. It is now the third state, `checking`,
  everywhere — never Connected, never silently hidden. `unknown` is tested FIRST,
  ahead of the missing-CLI check: an unconfirmable probe is ALWAYS `checking`.
  `providerIsConnected` is the ONLY connected predicate (badges, analytics
  transitions); `providerNotConfirmedDisconnected` is the permissive read,
  sanctioned ONLY for the tunnel auto-reconnect and the first-load
  `claudeAvailable` gate, never for a badge — and it keeps the OLD lenient
  reading when `auth_state` is absent (`cli_installed`), which the strict
  derivation deliberately does not. The chat picker's
  `hooks/use-provider-statuses.ts` carries the same agents-settled gate +
  a workspace-scoped query key as the hub's sibling hook
  (`lib/provider-statuses-query.ts` holds the pure rules).
  **The connections layer exposes ONE reader, `connectionState`** — no boolean
  sibling, because every surface that reached for one collapsed the third state.
  `groupProviders` returns three buckets (`connected` / `checking` /
  `available`): only `connected` may claim Connected (the hub's strip dot and
  the usage meters on its rows), only `available` gets a Connect CTA, and
  `providerOwnedSide()` is the render order the browse surfaces use.
- **A team space with no credential explains itself.** When statuses settle with
  nothing connected, the picker's level 1 shows an honest empty state instead of
  a blank panel. `pickerEmptyState` (`app/src/components/chat-model-selector-labels.ts`,
  copy under `chat:modelSelector.picker.noProviders.*`) has exactly TWO variants,
  `personal` / `team`, because the copy depends only on which KIND of space this
  is: every viewer of a team space has the same story ("You have not connected an
  AI account yet." / "Connect your own AI account and this team's agents will
  answer you."), since every one of them connects their own account and nobody
  can connect it for them. There is deliberately no role-shaped variant: an
  "ask a team owner or admin" line would be a dead end, because no role can
  connect the credential this viewer is missing.
  The ACTION stays gated on capabilities having LOADED (`canConnect`) — the
  surface must not promise a Connect before it knows the deployment describes a
  hub at all; `use-picker-view-models` folds the same signal into `catalogState`,
  so the picker holds its neutral loading state through that window. A
  capabilities load that FAILS is not "still loading": it settles on the
  permissive single-player default, since an undescribed deployment is that.
- **Boot with NO space settles honestly** (HOU-979). If `loadWorkspaces` fails
  (or yields no current workspace) `loadAgents` never runs, and every `loaded`
  gate hung: the boot splash never lifted and the provider probe never fired.
  `useHoustonInit` now calls the agent store's `settleEmpty()`, which settles the
  store AND tells the client `noteAgentsUnavailable()`. The failure itself is
  already surfaced by `lib/tauri.ts`'s `call()` (toast + Sentry) and recorded as
  the workspace store's `loadError` for the Settings retry.
- **Restore last space**: `resolveActiveWorkspace` (`app/src/lib/workspace-switch.ts`)
  restores the persisted `last_workspace_id`, else default, else first.

### Create-team

The switcher's create action routes on `caps.spaces`
(`app/src/components/shell/sidebar-chrome.tsx`): a Spaces host opens the
**Create-team dialog** (`create-team-dialog.tsx`, validation in
`create-team-model.ts`: trimmed, non-empty, `<= 60` chars, and the gateway
re-validates); a non-spaces host keeps the local "create workspace" action. On
success `useCreateTeam` (`app/src/hooks/queries/use-orgs.ts`) invalidates the
spaces list and reloads the workspace store so the new team bridges in as an
`org:*` workspace. `POST /v1/orgs` is NOT idempotent: a lost response is
reconciled via `listOrgs` (`reconcileCreatedTeam`), never blind-retried.

### Share-via-team pipeline (order is law)

Sharing a personal agent runs a **sequential, resumable** pipeline
(`app/src/lib/share-via-team.ts`, a pure state machine; wiring in
`app/src/components/tabs/share-via-team-flow.tsx`; hooks in
`app/src/hooks/queries/use-spaces.ts`). Steps:

1. **pick / create** a team (owner/admin teams only, `ownableTeams`);
2. **confirm**, then **move** the agent into the team
   (`POST /v1/agents/:slug/move` → `202 {moveId}`), **poll** `getMoveStatus` to
   terminal `done` (poll route only, never the event stream);
3. **switch** the active space to the team;
4. only after the switch, **invite** teammates (`addOrgMember`).

The invite MUST NOT fire before the move reaches `done` and the space has
switched. Inviting earlier could start a trial on a team whose move then fails,
or 403 `personal_space` against the still-personal active space.
`assertInviteReady` encodes the guard. Failure states surface INLINE (no red bug
toast; silenced from `call()` via `isExpectedShareError`), each retryable except
where noted:

- `moveFailed`: from a move rejection (`unsupported_move`, `unmovable_volume`,
  `needs_upgrade`) or a poll `failed`, plus a client-synthesized `timeout`
  (`MOVE_POLL_TIMEOUT_MS`, ~5 min, since `moving` is non-dismissable).
  `unmovable_volume` is terminal (no retry); the rest allow a bounded move retry.
- `switchFailed`: the moved team isn't in the reloaded workspace list; retry the
  switch (do NOT advance to invite, or invites would hit the wrong space).
- per-email invite failures (`already_member` etc.) track per row
  (`EmailInvite`), so a partial failure retries only its own rows.

### Billing surface

Team billing (C8 §Billing) surfaces in three places, all Spaces-gated and
team-space-only:

- **Billing tab** (`app/src/components/organization/billing-tab.tsx`): appended
  to the org dashboard tabs when `canSeeBillingTab(caps, activeSpaceIsTeam)`
  holds (`org-view-model.ts` `orgTabIds`; gate in `app/src/lib/org-roles.ts`:
  Spaces host AND active team AND owner/admin). Shows the derived status, seat
  count, and either checkout buttons (monthly/annual) or a "Manage billing"
  Stripe-portal button once subscribed (`billing-tab-model.ts` `billingAction`:
  `checkout` when unsubscribed, `portal` when `active`/`past_due` or an
  `interval` is set). Admins see it read-only with "ask the owner" copy (the
  admin degrade asymmetry: admin reads billing but cannot checkout). Data +
  actions via `use-billing.ts` (`useBilling`/`useCheckout`/`usePortal`; checkout
  and portal open the returned Stripe URL in the OS browser).
- **Trial countdown pill + degrade banner** (`team-status-banner.tsx`, decision
  in `app/src/lib/team-status-model.ts` `teamStatusView`): one strip at the top
  of the active space. Owner/admin drive off the billing `status`: `trialing`
  renders the countdown pill (`daysLeftUntil`, rounded up, UTC-safe; a clock-less
  "Free trial" label when `trialEndsAt` isn't written yet); `expired` renders the
  degrade banner. Plain members have no billing data and drive off
  `OrgSummary.degraded` alone (the member-visible expired signal that carries no
  billing detail). `free`/`active`/`past_due` render nothing.
- **`needs_upgrade` write failures**: a `403 needs_upgrade` (a non-owner writing
  into an expired team) is an EXPECTED business state, not a bug.
  `isNeedsUpgradeError` (`team-status-model.ts`) routes it to a plain
  informational toast instead of the red "report a bug" toast.
- **`personal_space` invite failures**: a `403 personal_space` (a member-add on
  the caller's personal space, which is non-invitable by design — share via
  creating a team) is likewise EXPECTED, not a bug. `isPersonalSpaceError`
  (`team-status-model.ts`) is routed in `tauri.ts` `surfaceError` exactly like
  `needs_upgrade` to an informational toast (`teams:personalSpace.inviteBlocked*`:
  "This is your personal space" / "Your personal space is just for you. Create a
  team to invite people."). Defense in depth: the org-surface gate (HOU-824) now
  hides the invite box in the personal space, so this toast is the fallback for
  any invite that still reaches the gateway.

**No push on expiry.** The effective status is a DERIVED gateway read, so the
client re-reads on entering a team space (the switch cache-drop refetches
`billing` + `orgs` clean) and on window focus (`refetchOnWindowFocus`), catching
an expiry that elapsed while away. Nothing is ever destroyed on expiry: reads
still work for everyone, the owner keeps full write access, one upgrade click
restores members.

### Capabilities recap + growth moments

- `caps.spaces` = the whole surface feature-detect (`hasSpaces`).
- `caps.role` is the ACTIVE space's role; re-fetched on every switch (cache drop).
- Growth beats, all Spaces-gated: an onboarding "invite your team" finish card
  (`onboarding/missions/onboarding-flow.ts` `showsInviteTeamCard`), a
  space-switcher tour step, and the personal-space person-filter teaser on the
  mission board (`app/src/components/mission-person-teaser.tsx`, which opens the
  create-team dialog so a solo user discovers that sharing turns the board
  multiplayer).

---

## Manager-only configure surfaces

When the caller is a plain member of a shared agent (`!isAgentManager`), the
configure surfaces are gated:

- **Agent Settings** (`job-description-tab.tsx`) is hidden entirely from
  non-managers: `standard-tabs.ts` only adds the `job-description` tab for
  single-player or `isAgentManager` callers, so members never reach it and there
  is no read-only banner. The tab is a two-column master-detail admin page (a
  settings nav rail, `agent-admin-sidebar.tsx`, grouping Configuration / Access +
  the selected section), manager-only and fully editable. Name / color / delete
  live on the sidebar agent row, not a "General" section (the old landing,
  back-bar, and General card are gone). On a public-API gateway
  (`capabilities.apiKeys`, C10) the rail adds a third card, **Connect** ("Use
  from other apps", `agent-admin-connect.tsx` + `connect-card.tsx`, `connect`
  i18n ns): the non-technical pitch that outside apps can drive this agent, the
  API-key step (reuses the settings `ApiKeyCreateDialog`, deep-links Settings >
  API keys), and the three copyable public addresses (MCP / A2A agent card /
  missions REST) built by the pure `lib/agent-connect-model.ts`
  (`connectEndpoints` from the gateway origin + `agent.id`-as-slug;
  `connectOrgSlug` resolves the A2A org slug from the team workspace id or the
  personal membership in `GET /v1/orgs`).
- **Model / effort pickers** (`chat-model-selector.tsx`,
  `chat-effort-selector.tsx`) are NOT hidden/locked for members (E8 reversed E7).
  In a Teams org the composer shows them to EVERYONE and clamps the option list to
  the agent's `allowedModels` ceiling. **Model scope is per MISSION (HOU-1064):**
  a pick made with a mission open writes that mission's activity pin (same
  activity-pin path as single-player, provider-switch consent included) and moves
  only that conversation; a pick in a fresh composer writes the caller's PERSONAL
  per-agent choice (`useAgentModelChoice` / `useSetAgentModelChoice`, optimistic
  cache update) — the default the user's NEXT missions start on. The picker
  displays the open mission's in-ceiling pin first, else the personal choice; an
  out-of-ceiling personal pick toasts `chat:errors.modelNotAllowed` instead of
  silently no-oping. Every send forwards the displayed pin on the wire and the
  gateway honors it when in-ceiling (see Enforcement below). A member never
  writes the shared agent config. A single-model ceiling renders read-only
  but still visible. Single-player / self-host is unchanged: shared config, no
  ceiling. The pure decision + clamp + resting-pin helpers live in
  `app/src/lib/model-selector-lock.ts` (`modelSelectorDecision`, `isModelAllowed`,
  `resolvePersonalModelPin` — mission pin wins in-ceiling; the ceiling snap
  resolves the model's OWNING provider via an injected catalog lookup — and
  `hiddenModelCount`, the count of DISTINCT blocked models across provider rows);
  the composer wires them in `use-agent-chat-panel.tsx`, revalidating the
  displayed effort against the pinned model (`validEffortOrDefault`).
  **The picker no longer hides blocked models silently:** when the ceiling narrows the
  universe it renders a non-interactive footer "N more models are turned off in your
  workspace" (`chat:modelSelector.picker.hiddenByWorkspace_one/_other`), fed by
  `hiddenModelCount`. ui/core's `ModelPicker` grew a props-only, i18n-agnostic
  `footer?: ReactNode` that renders after ConnectMore inside its CommandList.
- **Integrations tab** gates its edit affordances on `isAgentManager` /
  `canEditAgentGrants`.

The gateway 403s any configure-scope write regardless — these gates just avoid
showing a dead control.

---

## Allowed-models ceiling + per-user model choice

The model surface mirrors the integration allowlist: the manager sets a **ceiling**
(which models the agent may run on), and each member picks their own model **within**
it. (The E5 org-templates feature that used to live here was removed in E8. The
org-wide model ceiling was removed 2026-07-16 as overengineering — policy is per
agent only; a new agent defaults to every model.)

**The per-agent model ceiling has one frontend home** — the shared presentational
`ModelsAllowlistEditor`
(`app/src/components/ai-hub/models-allowlist-editor.tsx`, the model-side twin of
`AllowlistEditor`, extracted from the old inline `AgentModelsSection`): an
always-visible `AccessChoice` over the AI-hub catalog's `ModelAllowRow`s, `readOnly`
hides the "Add models" list, all copy passed in.

- **Per-agent ceiling** — Agent Settings > **Access** > **AI models**
  (`agent-admin-model.tsx` → `AgentModelsSection`, a thin wrapper over the shared
  editor). Manager-only, `readOnly` honoured. It answers WHICH models only —
  there is no per-agent choice of WHOSE account, because a team space has no
  account to choose between (see **Per-user AI accounts** below).
  The whole AI-hub catalog is the selectable universe (there is no org-wide
  ceiling to narrow it). Copy under `teams:agentAdmin.models.*`. The per-agent model
  ceiling ALSO surfaces (via `AgentAdminModel`) in the Permissions agent detail's AI Models
  tab (`permissions/agent-detail.tsx`), same editor, same wire. (The AI Models hub's
  old "Workspace policy" tab was removed; the hub now shows only Providers / Models.)

- **Ceiling** — `agent_settings.allowedModels: string[] | null` of provider-native
  model ids (`null` = all models allowed; a set = restricted; treat `[]` defensively).
  Edited manager-only in Agent Settings > **Access** > **Allowed models**
  (`agent-admin-model.tsx` → `AgentModelsSection`), written via
  `setAgentSettings({allowedModels})` (`useSetAgentAllowedModels`). The editor reuses the
  **AI-hub model catalog** (`useHubCatalog()`, so it and the AI Models hub never drift)
  and its visual language: one row per `CatalogModel` (`BrandMark` + friendly name +
  muted lab name + allow `Switch`), an always-visible two-option choice (`AccessChoice`:
  "Any model" saves `null`, "Only models you pick" saves an explicit set), an
  Allowed / Add split, and a search box backed by `searchModels()`. A `CatalogModel` is
  deduped across providers, so one visible row maps to SEVERAL offer ids: the pure,
  unit-tested `model-allowlist.ts` (`modelChecked` / `toggleModel` / `allowedModelCount`)
  keeps the id set in sync — a model is checked when ANY of its offer ids is present, and
  toggling adds/removes **all** of that model's provider offer ids at once (unknown/stale
  ids and other models' ids are left untouched; writes stay de-duplicated and sorted).
  The wire format is unchanged. Copy under `teams:agentAdmin.models.*`. The **AI-model row
  lives in the Access group**, which is multiplayer-only, so single-player never shows it:
  the sole user has no ceiling and picks a model in the composer (the old single-player
  Agent-Settings model pin + `useSaveAgentModel` were removed). The sidebar ceiling text
  and the `{{count}} models only` copy count **models** (`allowedModelCount` over the hub
  catalog, plus any unknown ids), not raw ids — falling back to the raw id count only
  while the catalog is still loading.
- **Per-user choice** — each acting user's own `{provider, model, effort?}` for one
  shared agent (`gateway.agent_model_choices`), written by the composer picker when NO
  mission is open (it is the default for the user's next missions), never the shared
  config. A pick with a mission open writes that mission's activity pin instead (HOU-1064).
- **Enforcement** — the gateway is the sole enforcer of the CEILING: an in-ceiling
  per-conversation body pin is honored verbatim (casing normalized to the ceiling's,
  provider backfilled from the stored choice when the wire omits it); a pin-less or
  out-of-ceiling turn falls back to the acting user's choice ∩ ceiling, else
  first-of-ceiling. A client can never run a model outside the ceiling
  (`cloud/internal/edge/agents/model.go`, contract `C7-teams.md`).
- Types: `AgentSettings.allowedModels` (the agent's whole model ceiling),
  `AgentModelChoice` (`{provider, model, effort?}`),
  `AgentModelChoiceInfo` (`{choice, allowedModels}`).
- Client: `getAgentModelChoice` (404-degrades to `null` off-Teams) / `setAgentModelChoice`
  (`GET`/`PUT /agents/:slug/model-choice`); `setAgentSettings` widened to
  `{allowedToolkits?, allowedModels?}`. Hooks: `useAgentModelChoice` /
  `useSetAgentModelChoice` (`hooks/queries/use-agent-model-choice.ts`),
  `useSetAgentAllowedModels` (`hooks/queries/use-agent-settings.ts`).

---

## Per-user AI accounts (HOU-976)

A team space has **no shared AI credential**. Every turn runs on the AI account
of the person who sent it, and on nothing else: the gateway resolves the ACTING
member's own credential row and stops there. A miss is an honest
`404 personal_not_connected` → the provider not-connected card, and the member
connects their own account in the AI Models hub. That is the entire remedy, so
it must be self-serve: there is no fallback account, no per-agent choice of
account, no one-turn override, and no role that can connect an account on
somebody else's behalf.

This is why every AI-credential role gate is gone (`canSeeAiModelsPage` is
unconditionally true — see the role-matrix section above). A gate can only be
justified by an authority someone actually has; nobody has authority over
anybody else's AI account here.

Storage is per **(org, user, provider)**, not (user, provider): connecting in a
team space is consent for THAT team's agents only, and leaving a team takes the
credential with the membership. A user in three team spaces connects three times.

**The discriminator is ALWAYS server-side.** A request resolves a per-user
credential when it carries an acting identity AND its org is a team space — two
facts only the gateway holds. It is NOT a query param, NOT a body field, and NOT
a signed claim the client may assert. **The client sends no scope anywhere**: no
`?scope=` on any credential or auth route, no `credentialScope` on a send body,
no scope argument on any credential function. A client-sent scope could only
restate what the gateway already knows or contradict it, and a contradiction
churns every recorded and golden request while adding nothing the gateway did
not already have. Two tests hold the line: `packages/web/tests/credential-write-urls.test.ts`
asserts each credential/auth URL WHOLE (byte identity, so a scope re-entering as
a query param, a path segment or a second query fails whichever form it takes),
and `app/tests/credential-scope-ui.test.ts` asserts no credential surface passes
a scope or names another account.

**Absence is the old world.** With NO acting identity — desktop, self-host, a
personal space, the setup runtime, a fired routine — every path addresses the
single workspace credential exactly as it did before this feature, byte for byte.
That is the `"team"` scope key (`TEAM_SCOPE_KEY` in
`packages/host/src/credentials/scope-key.ts`, `TEAM_CREDENTIAL_SCOPE` in
`packages/runtime/src/session/acting-context.ts`): one name for "the one shared
row", not a second account a team space can reach. `setup-runtime` credential
writes stay owner/admin for the unrelated reason that they provision a Deployment
+ PVC.

**Isolation is the whole implementation.** Only a gateway-SIGNED acting-as token
can select a member's own credentials (`credentialScopeKeyFor`); a routine's bare
creator sub deliberately cannot, and a token whose payload can't be decoded gets
its own digest-named scope rather than falling back to the shared row — a garbled
token must never READ the workspace credential. Both sides of the host↔runtime
seam derive the key the same way, on purpose, or one member would read a
different row per adapter. Downstream of the key: the runtime's credential store
resolves the scope on every `read()` pi makes inside `prepareRequest`
(`auth/credential-store.ts`, per-scope `auth.json` under `<dataDir>/auth-users/`),
login and serve-sync are scoped the same way, the served-scope record and
credential-health marks are keyed per `(scope, provider)`, `report-revoked` echoes
the scope it observed and forwards the acting token, the host's remote-store cache
is per scope, and the whole `auth-users/` subtree is denied to the agent's file
tools (`session/tools/fs-guard.ts`) and dropped unconditionally from store-sync.
The Anthropic-specific guards (the pod-shared `claude-login` write refusal, the
`CLAUDE_SECURESTORAGE_CONFIG_DIR` relocation that closes mid-turn 401 recovery,
the cached-status guard) are documented in `knowledge-base/anthropic-credentials.md`
traps #4 and #6 — read those before touching any of it.

**Attribution is read-only.** Two optional wire fields name WHOSE account
answered, and nothing else: `ProviderError.credential.scope` on a failed turn
(`packages/protocol/src/provider-error.ts`) and `credentialScope` on a
`GET /providers` row (`ProviderInfo`). Both come from the runtime's per-identity
serve record (`packages/runtime/src/auth/served-scope.ts`), which remembers what
the gateway resolved for each `(acting identity, provider)` pair. They exist so a
surface can say a TRUE sentence — "your Anthropic account is rate limited" rather
than a generic one — and they unlock no action, because there is no other account
to offer. Their `"personal"` value is the acting member's own account, the only
one a TEAM space has; `"team"` is the single workspace-level credential of a
personal space / desktop / self-host, reported for the surfaces that predate the
distinction. Both fields are omitted without an acting identity, so treat absence
as "one credential, nothing to disambiguate".

**Client surface**

- **The hub is one list, labelled once.** In a team space `ai-hub-view.tsx`
  renders a "Your accounts" heading + description above the catalog
  (`aiHub:accounts.title` / `accounts.description`: every agent in this team
  space runs on the AI account of whoever messages it, so the accounts here are
  your own). Saying it once, above the rows, is what keeps a member from reading
  them as the team's shared connections. A personal space has one account and
  nothing to qualify, so it renders no note at all and looks exactly as it
  shipped. There are no account sections, no per-section status, and no scope on
  any connect the hub performs.
- **Reconnect is unscoped** (`tauriProvider.launchLogin(provider)`), on the
  unauthenticated card and the in-chat reconnect card alike. The account that
  failed is the caller's own by construction, so there is nothing to target.
- **Failure copy names the account** where it changes the meaning:
  `ModelUnavailableCard` reads `credentialScopeOf(error.credential) === "personal"`
  (`app/src/lib/credential-scope.ts`) and switches to
  `shell:providerError.credential.modelUnavailableBody`, so a member learns it is
  THEIR plan that lacks the model. No card gains an action from `credential`.
- **Model picker**: a `GET /providers` row's `credentialScope` becomes the row
  subtitle via `statusCredentialScope` + `pickerAccountLabel`
  (`chat:modelSelector.picker.account.*`). Absent ⇒ today's subtitle, unchanged.
  There is deliberately NO client-side per-plan entitlement filtering beyond
  `configured`: a personal plan that lacks a model fails the turn honestly as
  `ModelUnavailable`.

Both readers are gathered in `app/src/lib/credential-scope.ts` and unit-tested
without a renderer (`app/tests/credential-scope.test.ts`). There are two of them
rather than one generic reader because every field of the shape is optional: a
`ProviderStatus` passed to `credentialScopeOf` would type-check and answer `null`
forever, so one named reader per shape makes that impossible instead of merely
unlikely.

---

## Invites, members, audit, usage

- **Invites**: `addOrgMember(email, role)` → `POST /v1/org/members` (the shipped
  adapter path, `packages/web/src/engine-adapter/cp/orgs.ts`; targets the ACTIVE
  space; `403 personal_space` on a personal one — surfaced as the friendly
  `personalSpace` toast, and the invite box is hidden there per HOU-824). A known user is added
  directly (`AddOrgMemberResult.userId`); an unknown email creates a pending
  invite and the host answers **202 `{invited:true}`**. `OrgInvite` rows surface
  on `GET /org` for owner/admin; `deleteOrgInvite` revokes (owner only).
  > **C8 changed acceptance.** The old "one-org-per-user, consumed atomically at
  > first sign-in" rule is gone: a user can belong to many teams. A NEW user's
  > pending invites auto-accept oldest-first after the personal space is minted;
  > an EXISTING user accepts explicitly via `acceptInvite` / declines via
  > `declineInvite` (invites addressed to them ride `GET /v1/orgs`'s `invites`,
  > `OrgInviteSummary`). Personal is ALWAYS minted, never replaced. See the
  > **Spaces** section and `cloud/docs/contracts/C8-spaces-billing.md`.
- **Member emails** — `OrgMember.email` populated on `GET /org` when the host
  exposes it; the roster shows them.
- **Audit** — `orgAudit({limit?, before?})` → `AuditEntry[]` newest-first
  (owner org-wide; admin filtered to their agents). Paging in `org-view-model.ts`
  (`AUDIT_PAGE_SIZE`, `nextAuditCursor`).
- **Usage** — `orgUsage(days)` → `UsageRow[]` (message count per
  agent/user/day).

---

## Integration allowlist ceiling

Members can only connect apps the agent allows. See `integrations.md` §2
for the full model. In short: `effective = agentCeiling` (`null` = all, `[]` =
none — the org-wide ceiling was removed 2026-07-16 as overengineering; policy is
per agent only), now-disallowed toolkits are pruned from live connections when the
ceiling shrinks, and a per-agent connect carries the agent slug so the gateway
checks the toolkit against the allowlist on a successful OAuth.

**The per-agent ceiling has one frontend home** — the shared presentational
`AllowlistEditor` (`app/src/components/integrations/allowlist-editor.tsx`):

- **Per-agent ceiling** — Agent Settings > **Access** > **Apps**
  (`AgentAllowlistSection`, manager-only). The whole catalog is the selectable
  universe (there is no org-wide ceiling to narrow it). Client: `getAgentSettings` /
  `setAgentSettings`. Copy under `teams:integrations.allowlist.*`. The per-agent app
  ceiling ALSO surfaces (via `AgentAdminIntegrations`) in the Permissions agent detail's
  Integrations tab (`permissions/agent-detail.tsx`), same editor, same wire.

The global Integrations page has no ceiling to apply (policy is per agent), so it
never locks a row — it's the personal catalog for every member. Connections are
per USER and global: one connection serves every agent that person may use.
**Usable = connected AND the person may use the agent AND the toolkit is inside
that agent's app ceiling.** There are no grants anywhere — the per-`(user, agent)`
grants layer was DELETED (client, host and UI; `integrations.md` §2), so no
surface carries a grant toggle, the app detail modal included.

**Design principle: blocked is visible, never silently hidden.** Applied wherever the
agent ceiling narrows a member's world: the per-agent Integrations tab ITEMIZES the
locked items as rows a member can see and search; the composer model picker SUMMARIZES
the remainder with a count footer instead of a silent gap. The wire surface is unchanged
and the gateway is still the sole enforcer; these are client-side transparency
affordances over the effective (agent) allowlist.

Concretely on the agent Integrations tab, a ceiling-blocked app shows in one of two places
rather than hiding: a CONNECTED blocked app appears in the disallowed section
(`teams:integrations.notAllowed`, "Not allowed" badge + an ask-your-admin line), and a
NOT-connected blocked app appears as a **locked row** in the browse catalog (lock icon +
`integrations:locked.askAdmin` "Ask your admin to enable {app}", capped preview; see
`integrations.md` §3 "Locked browse rows"). The ceiling editor (`AgentAllowlistSection`)
reads as admin POLICY via `teams:integrations.allowlist.policyHelper`. Member connect
surfaces stay account-connection language ("connected to your account"), never "allowed".
The pure split is `browseCatalogView` (`integrations/model.ts`); off Teams
(`allowlist === null`) nothing is ever locked.

**Role-aware signposting (Part B): a fixer sees a deep link, not "ask your admin".** Both
blocked-state surfaces (the disallowed section AND the locked browse rows) accept an optional
`PermissionsFix` resolver. A blocked app is always outside the AGENT ceiling (policy is per
agent only), so when the VIEWER can lift it, the ask-your-admin line is replaced by an
"Enable it in Permissions" button that deep-links to that agent's Permissions detail on its
Integrations tab (`requestAgentDetail(agentId, "integrations")`, `permissions-nav-store.ts`)
— one `openSettings("permissions")` call on the UI store (never a bare
`setViewMode("settings")`; see `agent-manifest.md`) plus a `usePermissionsNav` request. The gate is `canManageAgent`
(agent-manager AND `showOrganization`, the DESTINATION's own gate from
`useSurfaceGates` — `canSeeMembers` was too loose and let an admin in a personal
Spaces space follow the link only to bounce off the Settings index); members and
non-admin managers keep the old copy (the resolver returns `undefined`). Authority lives in `integrations/blocked-ceiling.ts`
(`resolvePermissionsFix`), built at the agent tab and threaded down as props so the leaf
sections stay presentational. See `integrations.md` §3 for the full wiring.

---

## Mission attribution + the board surface

Who created and collaborated on each Kanban mission (`.houston/activity/activity.json`),
shown as avatar face stacks and a filter-by-person control. Multiplayer-gated on
`caps.multiplayer`; single-player never renders or resolves any of it.

**The data is server-stamped, never agent-written.** Two optional fields on
`Activity`: `created_by?: string` (the human who created the mission) and
`contributors?: {user_id, name?}[]` (everyone who started or collaborated). The
host derives them from the gateway's `x-houston-acting-as` header
(`actingAuthorFromHeader`, `packages/host/src/auth/acting.ts`) and writes them on
mission **create**, **PATCH** edit, and each **user turn** — only when
`deps.gatewayFronted`. Off the gateway (desktop / self-host) `author` is null and
nothing is stamped, so an `activity.json` there stays **byte-identical** (no
attribution keys). Turn stamping (`stampTurnContributor`,
`packages/host/src/routes/activity-attribution.ts`) matches the mission by
`session_key` or `activity-<id>`, is best-effort, and NEVER blocks or fails a turn
(a stamping error is swallowed with a log). Schema:
`ui/agent-schemas/src/activity.schema.json`; domain writes in
`createActivity` / `applyActivityUpdate` / `upsertContributor`
(`packages/domain`). More on the files side → `knowledge-base/files-first.md`.

**Threading to the UI.** engine-client `Activity` / `ConversationEntry` carry the
fields → web engine-adapter → app `RawConversation` → `use-mission-control` builds
each `KanbanItem.people` via `app/src/lib/mission-people.ts` (pure, DOM-free,
unit-tested: creator first, deduped; label falls back **profile name > stored
`name` > 8-char id slice**; avatar is the profile image when known).

**Board surface (`@houston-ai/board`).** Generic `KanbanPerson`
(`{id, label, imageUrl?}`) + a `KanbanPeople` overlapping face stack render on
cards (`kanban-card.tsx`, up to `CARD_PEOPLE_MAX = 5` faces at `sm`) and the
detail panel (`kanban-detail-panel.tsx`, 3 at `md`). Anatomy: circles overlapped
`6px`, each carrying a `2px` ring painted in the SURFACE colour it sits on
(`input` on cards, `background` on the panel) so an overlap reads as a cutout,
not a halo; the initials fallback is OPAQUE, a desaturated tone hashed from the
person's stable id (`personToneClass` — the same teammate wears the same colour
everywhere, and the same hash picks the `text-person-name-*` tone their name
wears in chat via `personNameToneClass`; see `DESIGN.md` person palette); the
"+N" chip is a solid
`bg-person-overflow` fill and, when `expandable`, a button whose popover lists
EVERY contributor. The card body reserves a right gutter sized to the painted
stack and rounded up to the sanctioned spacing scale (`peopleGutterClass`) so
the description never runs under the faces — `""` for an unattributed card, which
keeps a single-player board byte-identical. Props-only, i18n-agnostic (labels
passed in). Alongside the agent filter, the app adds
`mission-person-filter.tsx` — a dropdown of **Everyone / My missions / each person
on the board** (roster from `distinctBoardPeople`), itself gated on
`isMultiplayer` and a signed-in user.

**Teammate names + photos — gateway-backed (HOU-876).** The Supabase `public.profiles`
table + avatar storage were retired with Supabase auth (RLS `auth.uid()` can't match a
GCIP uid; see `knowledge-base/auth-migration.md`). The source is now the **gateway**,
which stores each user's GCIP `name`/`picture` and serves them two ways:

- **Inline on the roster.** `GET /v1/org` members each carry optional
  `displayName?`/`photoUrl?` (`OrgMember`). The **People roster**
  (`people-roster.tsx`) reads these directly — display name is the primary label,
  the email drops to a muted secondary line, and `photoUrl` is the avatar (initials
  fallback via the design system's `Avatar`/`AvatarFallback`). No profiles fetch there.
- **By id for face stacks.** `GET /v1/org/profiles?ids=<csv>` (`getOrgProfiles`,
  `cp/orgs.ts` + `orgs-mixin.ts`, `tauriOrg.profiles`) resolves display profiles for any
  contributor id, `200 {"profiles":{"<id>":{displayName?,photoUrl?}}}`. `useUserProfiles`
  (`app/src/hooks/queries/use-user-profiles.ts`) is a real TanStack Query over it —
  multiplayer-gated (`alwaysEnabled` for the caller's own id in `useMyProfile`), ids
  deduped+sorted into a stable key `[USER_PROFILES_KEY, ...ids]`, `staleTime` 5 min. It
  backs the mission face stacks (`mission-people.ts`, `KanbanPeople`), the person filter,
  the Share dialogs, and the agent People tab (avatars). Wire→app mapping
  (`displayName`/`photoUrl` → `name`/`avatarUrl`, absent → `null`) is the pure
  `mapProfilesResult` (`user-profiles-map.ts`).

**Privacy boundary.** The gateway is the sole enforcer: `/v1/org/profiles` returns a
profile ONLY for a **co-member of the caller's active space** (≤100 ids/request);
non-co-members are omitted, and a **personal space resolves only the caller**. Off-gateway
(desktop/self-host) and on a pre-feature gateway (404) both reads degrade to an empty map —
faces fall back to initials, `useMyProfile` collapses to the session's displayName/photoUrl
— so a single-player `activity.json`/roster stays byte-identical. It is a cosmetic,
non-user-initiated read: `tauriOrg.profiles` runs with `{toast:false,capture:false}`, so a
rare hard failure stays silent and consumers fall back via React Query's `isError`. i18n:
`dashboard:peopleFilter.*`, `board:people.label` (en/es/pt).

## Chat sender attribution (HOU-943, HOU-960)

In a multiplayer chat, group presentation starts only when the transcript proves
someone besides the viewer participated: a user-message author differs from the
resolved viewer id, or the transcript has at least two distinct author ids while
that profile is still resolving. It follows WhatsApp-group semantics: a group
chat labels the people you talk TO and never you, and a name is an answer to
"who is talking now", so it prints once per change of speaker rather than once
per message. A viewer-and-agent transcript keeps the classic single-player
layout. The app passes `true` for the proven group case and otherwise omits the
prop, preserving `ui/chat`'s distinct-authors fallback. Single-player renders
no sender presentation at all: no name, no face, no reserved column (byte-identical
transcript).

**The identity travels on the view-model.** A message's author is already stored
and on the wire (`ChatMessage.author`, stamped by the runtime from
`x-houston-acting-as`, gateway-fronted only). `@houston/sdk` now carries it end to
end: `FeedItemVM.author` (additive), folded by `seedHistory` / `prependHistory`
from `historyToFeed`'s `FeedFrame.author`, and stamped on the OPTIMISTIC send via
`StreamTurnOptions.author` — so a teammate's bubble keeps its identity across
reload, scroll-up paging, and the live send alike. The optimistic identity is
supplied by the surface (the SDK has none): `SessionStartRequest.author` →
adapter `streamTurn` → SDK, filled once in `tauriChat.send` from
`app/src/lib/acting-user.ts` (a read of the shared `["session"]` cache; signed
out ⇒ absent ⇒ authorless, exactly as today).

**Three row anatomies** (HOU-960, group-chat grammar). A TEAMMATE's user turn
mirrors to the LEFT: their 32px face top-aligned in a fixed column beside the
bubble (`ChatPeerRow`), their name as the bubble's FIRST LINE (`text-xs
font-semibold`, that person's tone), and the bubble itself the recessed
`bg-chip` fill with a `border-line` hairline and the incoming geometry — 12px
corners, top-left squared toward the face, `px-3 py-2` (`is-peer` in
`ai-elements/message.tsx`) — instead of the viewer's near-ink fill: a left-hand
bubble in the reader's own colour reads as something the reader said. The
AGENT's turn in a shared chat is one more group member: the SAME incoming
bubble (`is-peer is-agent`, wider at `max-w-[85%]` for prose), its 32px mark in
the face column, its name as the bubble's first line painted in the agent's own
avatar colour; in single player it stays bare left-aligned prose, exactly as
always. The VIEWER'S OWN turn keeps the right-aligned near-ink bubble
(`is-user`) with NO face and NO name, adopting the compact mirrored geometry
(12px, top-right squared) only when the thread is attributed. The "You" line is
gone from the screen; `authorLabels.you` is announced in an `sr-only` span
instead, because alignment is a visual-only cue a screen reader cannot see.

**Run grouping** (`ui/chat/src/chat-sender-runs.ts` — pure, JSX-free, unit-tested
in `ui/chat/tests/attribution.test.ts`). Name and face print on the message that
OPENS a run from one sender; the rest of the run renders bare with the avatar
column still reserved, so consecutive bubbles line up under the face instead of
stepping left. `senderRunKey` keys a user message on its author id (`user:` + id;
an authorless message keys on the empty id, which is right on both paths that
produce one), a system message on its own message key (so a divider can never
join a run and always breaks the one it interrupts), and every assistant turn on
the constant `AGENT_RUN_KEY`. `senderRunStarts` walks the DISPLAY items and SKIPS
`kind: "process"` blocks, so an agent's tool/reasoning work is transparent: it
neither starts nor breaks a run. `ChatMessages` computes the start set once per
render and hands each row its `isRunStart`.

**Rendering (`@houston-ai/chat`).** `ChatPanel`/`ChatMessages` take
`showSenders` (force attribution on every turn; omitted = the legacy
"≥2 distinct authors" heuristic, user rows only), `agentLabel`,
`renderSenderAvatar` and — new in HOU-960 — `senderNameClass`, the Tailwind
text-colour utility a row's sender NAME is painted in. That is the seam: the APP
supplies sender presentation as DATA (the face, the name's colour) because it is
the only side that knows the palette, the profile and the agent; `ui/chat` owns
layout, alignment and grouping and stays palette-free and i18n-agnostic.
`chat-sender-parts.tsx` holds the three pieces (`ChatSenderName`,
`ChatSenderHeader`, `ChatPeerRow`; the old `chat-sender-header.tsx` is gone),
`chat-message-item.tsx` composes the row against `chat-message-item-types.ts`,
and `chat-message-body.tsx` takes the name as a `nameSlot` so it renders INSIDE
the bubble (or directly above a custom `renderUserMessage` node, which brings its
own container). The pure rules stay in `author-label.ts`: `isOwnMessage`
(absent author OR unresolved viewer ⇒ "own", so a legacy transcript and the
signed-in-but-not-yet-resolved window both render today's layout) and
`senderNameFor` (own or authorless ⇒ `null`; `authorLabelFor` is gone, since a
viewer's own row is no longer labelled on screen).

**App wiring.** `use-chat-sender-avatars.tsx` resolves it: `showSenders` from
the multiplayer transcript and resolved viewer profile, `agentLabel` from the
agent, faces from the SAME batched
`useUserProfiles` lookup the board face stacks use (ids collected from the feed's
authors, own rows via `useMyProfile`, `PersonFace` initials fallback), and
`senderNameClass` = `personNameToneClass(author.userId)` for a human,
`agentNameToneClass(agent.color)` for the agent. `use-agent-chat-panel` returns
the four props, `authorLabels.you` = `chat:attribution.you`, and every AIBoard
mount forwards them. E2E: `packages/web/e2e/chat-senders.spec.ts` against the
fake host's `/__test__/chat-history` control.

**Name tones are their own tokens, measured not assumed** (HOU-960). A person's
colour is a property of the PERSON: `personNameToneClass` and `personToneClass`
(`ui/board/src/kanban-people-tone.ts`) share ONE `personToneIndex(id)`, so a
teammate's name and their avatar are the same hue on the board and in chat alike.
The hue is the same, the VALUE is not: the `person.*` fills were tuned to carry
white initials and measure 2.90–3.14 as name text on the dark bubble, so five new
tokens `--ht-person-name-{slate,sage,mauve,taupe,indigo}` (light + dark) retune
the same families for text, bridged as `text-person-name-*` in
`ui/core/src/globals.css`. The seven agent colours are now bridged as
`text-agent-*` too (avatars still resolve to an inline `var(--ht-agent-*)`, since
a fill is picked at runtime from data, not from a class the markup can spell).
`agentNameToneClass` (`ui/core/src/agent-name-tone.ts`) MEASURES each agent
colour against the theme's real chat surface at module load (dark composited
through the glass) and emits a complete literal class per outcome, dropping to
`text-ink` in whichever theme cannot carry 4.5:1; all seven pass both themes
today (worst: golden 4.80 light, crimson 6.02 dark). Guards:
`packages/design-tokens/test/contrast.test.ts` re-measures every person-name and
agent token against the composited surfaces read out of the generated
`dist/css/tokens.css`, and `ui/core/tests/agent-name-tone.test.ts` pins the
branch table.

---

## Chat @mentions (HOU-944)

Tag a teammate in a shared chat. Typing `@` in the composer raises a picker over
the space's co-members; accepting inserts the PLAIN TEXT `@Name ` (the composer
stays a plain textarea, no contenteditable) and remembers `{userId, name}` on the
side. On send, the pending mentions whose `@Name` still appears in the message
ship as a structured `mentions[]` sidecar next to the prompt: **the model reads
prose, the wire carries identities.** Agents mention humans back in plain text
(the product prompt tells them to address a person as `@Name` when a reply needs
that person's confirmation), so ASSISTANT mentions are never structured.

**The roster.** `GET /v1/org/people` → `{people:[{userId, displayName?,
photoUrl?}]}` — the sanitized co-member directory of the ACTIVE space, served to
EVERY member (a personal space resolves only the caller), named-first, no emails
and no roles. Unlike `GET /v1/org` it is NOT owner/admin-only: every teammate
must be able to mention their co-members. `getOrgPeople` 404-degrades to `[]`
(an older gateway simply has no autocomplete), and the app hook
`use-org-people.ts` is multiplayer-gated exactly like `useUserProfiles`
(`staleTime` 5 min, no toast, no Sentry). It returns TWO lists: `people` (named
co-members, viewer INCLUDED — the render roster, so an agent writing your name
chips it) and `mentionable` (`people` minus the caller — the composer list). A
co-member with no display name is never offered: `@a1b2c3d4` means nothing to a
non-technical reader.

**The wire.** `mentions?: {userId, name?}[]` rides beside `author` the whole way:
protocol `ChatMessage.mentions` + the `user` frame's `data.mentions`, runtime
`UserMessageMeta` (persisted) and the send-route body, `SessionStartRequest`
/ `ChatHistoryEntry`, and the SDK's `TurnSendInput` / `StreamTurnOptions` /
`FeedFrame` / `FeedItemVM` (so a live send, a reload and the offline cache all
chip identically). Every untrusted reader runs the ONE shared guard
`parseMentions` (`packages/protocol/src/conversation.ts`, hand-rolled, no zod).
It caps the result at `MENTIONS_MAX` 32, clips `userId`/`name` to
`MENTION_USER_ID_MAX` 128 / `MENTION_NAME_MAX` 256, keeps the FIRST entry per
userId (a repeat can't spend the budget), stops scanning after
`MENTIONS_SCAN_MAX` 1000 raw entries (a junk array is never walked in full),
drops junk entries and omits the field when nothing survives. This is the
persistence a notification/inbox feature consumes: scan a conversation for
`mentions[].userId === me`.

**Rendering (`@houston-ai/chat`).** `MentionChip` + the pure span finder
(`mention-spans.ts`) + a hand-rolled rehype pass (`mention-rehype.ts`) appended
AFTER Streamdown's own `raw → sanitize → harden` chain (Streamdown REPLACES its
plugin list when you pass `rehypePlugins`, so the defaults are spread back in;
the plugin is passed in tuple form because Streamdown caches processors by plugin
name + `JSON.stringify(options)`). A user bubble chips off the message's own
`mentions[]`; assistant prose is matched against the `mentionPeople` prop. A
mention of the viewer wears the highlight wash.

Matching rules that are easy to get wrong, all in `mention-text.ts`: BOTH the
roster names and the message text are normalized to **NFC** before anything is
compared, because the span finder slices the text by the name's UTF-16 length
and "é" has two spellings — so the two must agree or a chip truncates
mid-grapheme. Span matching is therefore case-folding ONLY; the accent-folding
key (`mentionKey`) is used exclusively by the autocomplete FILTER, where a
length change is harmless. Two co-members with the same display name collapse
to ONE render target ("@Ana" cannot say which Ana), carrying the OR of their
`isSelf` flags so the viewer's emphasis is never lost to sort order; which
userId each occurrence ATTRIBUTES to is decided at send time instead, by handing
occurrences to the pending picks in order (`mention-send.ts`).

The composer half is `use-mention-autocomplete.ts` (+ `use-mention-combobox.ts`
for the ids, `chat-input-mentions.tsx` for the surface), intercepting
Enter/Tab/arrows/Escape through `PromptInputTextarea`'s external-handler-first
`defaultPrevented` seam. Four rules live there: the list takes NO key while an
IME composition is in flight (`mention-keys.ts` — Arrow/Escape/Enter/Tab all
belong to the candidate window); a dismissal sticks for the LIFETIME of its
token (same `@` index) and lifts only when the token stops existing, and a
pointer-down on the anchor textarea is not a dismissal at all; the textarea
itself carries the combobox ARIA (`role`, `aria-expanded`, `aria-controls`,
`aria-activedescendant`) since focus never leaves it — which is why the list is
plain markup, not cmdk, whose own element ids overwrite the caller's; and
pending picks are parked per `draftKey` (the ChatPanel's `sessionKey`) in a
bounded map, so switching conversations neither loses them nor cross-attaches
them, with the send snapshotting rather than consuming them (a rejected send
keeps its text, so it keeps its mentions).

At SEND time the text is run through `mention-mask.ts` first — fenced code,
inline code spans and inline links are blanked one character for one — because
the renderer never chips inside `code`/`pre`/`a` and a mention recorded there
would notify someone about a message that addresses them nowhere. It is a
lexical pass, not a parser; the residual gaps (indented code blocks, reference
links, autolinks, raw HTML) are listed in that module's header.

**App wiring.** `use-chat-mentions.tsx` resolves the four props
(`mentionPeople`, `messageMentionPeople`, `renderMentionAvatar` = `PersonFace`,
`mentionLabels`); `use-agent-chat-panel` returns them as `mentionProps` and
every AIBoard mount spreads them. Display names are normalized to NFC at that
boundary (`org-people-map.ts`). The mentions themselves travel as an argument, not state:
`ChatInput.onSend(text, files, mentions)` → `AIBoard.handleSend` →
`onSendMessage`/`onCreateConversation`/`onComposerSubmit` → the board sources'
`SendOverrides` bag → `tauriChat.send({mentions})`, including the warming-send
queue (a parked message keeps its chips across a relaunch). E2E:
`packages/web/e2e/chat-mentions.spec.ts`.

---

## Relevance-scoped notifications (HOU-945)

**User-set display identity (Settings > Profile).** Every member can set their
own display name and picture: `settings:profile.*`, section `profile` first in
`SETTINGS_SECTION_IDS`, hidden entirely when `GET /v1/me/profile` 404s (old
gateway) or off-identity. The photo is cover-cropped browser-side to 256px
(`app/src/lib/avatar-image.ts`, reusing `image-crop.ts`) and PUT as a data URI;
the gateway stores overrides that survive token refreshes (cloud C7,
`/v1/me/profile`). A save seeds the profile query and invalidates
`USER_PROFILES_KEY`, `ORG_PEOPLE_KEY`, and the org roster, so every face stack,
sender avatar, and @mention row repaints live. Related: both sign-in
completions now backfill the GCIP account RECORD's photo/name from the provider
identity when the record lacks them (web `firebase-popup.ts`, desktop
`accounts:update`) — the token claims are minted from the record, so without
the backfill the gateway never learned a Google photo at all.

**The header bell (HOU-963).** The per-agent header's old Share button is now a
notifications bell: badge = the outstanding-mention count, the menu = the same
rows/model/nav as the Mission Control inbox (`shell/notifications-bell.tsx`
reusing `mentions-inbox-row`, `mentions-inbox-view-model`, and the shared
`board/mention-row-nav.ts` `openMentionRow`), multiplayer-gated. Sharing stayed
reachable from Agent Settings and the Permissions People tab. The composer's
"Shared agent" banner was removed with it (`teams:share.chatNote` deleted).

With many agents running in parallel, a user must only be signalled when it
matters to THEM. There is **no settings toggle** (features-default-ON): relevance
IS the behaviour, and the existing global notifications on/off switch is
untouched.

**The relevance rule is not re-derived.** It is `missionMatchesScope(people,
{kind:"me"}, selfId)` from `app/src/lib/agent-person-scope.ts`, reached through
`app/src/lib/mission-relevance.ts`: a mission is mine if my face is on it
(`created_by`/`contributors`) OR it carries no attribution at all. That second
clause is load-bearing and keeps desktop/single-player byte-identical. A mission
that @mentions me is relevant too, whether or not I ever touched it.

### The mention aggregate lives on the ACTIVITY, not on `ConversationSummary`

The client's mission list is derived from activities
(`engine-adapter/client/activities-mixin.ts` → `activityToConversation`), NOT
from the runtime's `ConversationSummary`. So the per-mission aggregate rides the
activity record, which the board already fetches:

```ts
// packages/protocol/src/domain/activity.ts
interface ActivityMention { user_id: string; at: string; by?: string }
const ACTIVITY_MENTIONS_MAX = 32;
interface Activity { …; mentioned?: ActivityMention[] }
```

Latest-per-person (an array of "who has been pinged here, and when", not a log),
capped by dropping the oldest `at`. Declared in `ui/agent-schemas/src/activity.schema.json`
(the doc is `additionalProperties: false`) and sanitized on read by
`sanitizeMentions` inside `normalizeActivities`.

**Server-stamped, one write.** `stampTurnAttribution`
(`packages/host/src/routes/activity-attribution.ts`, formerly
`stampTurnContributor`) now upserts the contributor AND the mentions in a single
load→save→emit pass. It runs only when a gateway vouched for the actor
(`actingAuthor` non-null), so off the gateway nothing runs, not even the body
read, and `activity.json` stays byte-identical.

Getting the mentions there needed one structural change: the turn body is
normally first read inside the channel, so `ChannelCtx` gained an optional
`body?: Buffer`. `routes/agents.ts` drains the turn POST once, derives the ids
with the shared `parseMentions` guard, stamps, and hands the buffer down; both
`ProxyChannel` and `TurnChannel`/`dispatchCloudrun` prefer it over the
(now-exhausted) stream. Threaded on to `ConversationEntry` → `RawConversation`.

A malformed turn body is not that seam's business — it stamps no mentions and
passes the body on. `dispatchCloudrun` now GUARDS its parse and answers
`400 {"error":"invalid JSON body"}` (re-throwing `BodyTooLargeError` so an
over-cap body still maps to a clean 413). The proxy path is unchanged and still
relays the pi runtime's `500 {"error":"internal error"}`, because
`runtime/src/transport/http-helpers.ts` `readJson` is unguarded — a live
follow-up, not something the host can fix from its side.

`sanitizeMentions` keeps the NEWEST `ACTIVITY_MENTIONS_MAX` entries by `at`
(returned in file order, ties stable), matching `upsertMentions`'s
evict-the-oldest rule. It used to truncate to the first 32 in file order, so a
read could drop exactly the mentions a write had just decided to keep.

### Read cursors are per-device localStorage, on purpose

Five modules, one concern each:

| Module | Owns |
| --- | --- |
| `app/src/lib/read-cursors.ts` | the pure cursor ALGEBRA (keys, floors, watermarks, the 500-entry cap) |
| `app/src/lib/read-cursors-merge.ts` | how two views of one user's store combine (the cross-tab rule) |
| `app/src/lib/read-cursors-parse.ts` | decoding an untrusted stored blob; the `version` stamp |
| `app/src/lib/read-cursors-storage.ts` | the `localStorage` seam: key, merge-on-write, foreign-account eviction |
| `app/src/lib/read-cursor-live-store.ts` | the singleton instance + subscribers (React-free, so a notification callback reads it) |

`app/src/hooks/use-read-cursors.ts` is now only the React bindings
(`useReadCursorStore` = `useSyncExternalStore` over the live store,
`useReadCursorTracker` = the "viewed" observer).

Key `houston.read-cursors.<uid>`, per-uid so two accounts on one machine never
read each other's state. Each entry holds `readAt` and the mention `notifiedAt`
watermark; the store's `since` is the floor for anything with no cursor of its
own, so a fresh device does not open on a backlog. The persisted envelope also
carries `version: 1` and a `lastTouched` stamp.

The tradeoff, taken deliberately: an unread badge is local reading state and the
user experiences clearing it as instant. Host preferences would put a request on
every mission open, and in hosted mode that request can be the thing that WAKES a
sleeping pod. Cost: a second device starts from its own `since`.

**A second TAB is not a tradeoff, it is the normal case.** One whole-blob value
per user means a plain `setItem` is last-writer-wins: the tab that saves second
erases every mission the other one cleared. So every save is a read-modify-write
(`saveReadCursors` merges against disk and RETURNS what it wrote — callers must
adopt that, not the value they passed), a `window` `storage` listener folds the
other tabs' writes in live, and the merge rule is per conversation: the LATER of
each watermark, the EARLIER `since`. Watermarks only move forward, so the two
tabs are never in conflict — they each know part of the truth.

**Foreign accounts are evicted** (`pruneForeignCursorStores`, on every uid
change): the 4 most recently `lastTouched` blobs of OTHER uids survive, the rest
are removed. Nothing used to clean them up, so a shared machine accreted one
uncapped blob per person who ever signed in, against a ~5MB origin quota shared
with the query persister.

**Two clocks in `isUnreadForMe`.** An outstanding @mention is measured against my
cursor for that conversation ALONE (`mentionReadFloorFor`, no `since` fallback):
someone typed my name, so it stays unread however old it is, and it survives the
mission moving on without me. Ambient movement uses `updated_at` vs the normal
floor. Without the split, signing in on a second device silently marked every
pre-install mention as read, which is exactly the miss this feature exists to
prevent.

**`notifiedFloorFor` folds `readAt` in.** `markRead` deliberately never touches
`notifiedAt` (the two watermarks answer different questions, and collapsing them
at write time would clear the badge a ping had just announced), so the OS-ping
floor is `max(notifiedAt ?? since, readAt)` instead. Without it, a mention landing
in a conversation ON SCREEN — or one predating the mission you just reopened
after a reload — still fired a desktop notification.

**Self-authored mentions never count.** `missionMentionsMe` / `latestMentionFor`
(`lib/mission-relevance.ts`) require `by !== selfId`, so typing your own name
cannot earn a permanent inbox row plus a mention-unread badge nothing can clear
(the mention clause has no `since` floor). An entry with NO `by` still counts —
the gateway only began stamping authors with this feature, and reading "no
author" as "me" would swallow a whole generation of real mentions.

The "viewed" seam is the `["chat-history", agentPath, sessionKey]` query, observed
raw (`getObserversCount() > 0`) so no surface has to remember to report anything;
session keys are resolved to conversation ids by
`app/src/lib/chat-conversation-id.ts`, cache reads only. It answers **null** when
no cached list can name the mission (a cold `routine-<id>`), and the tracker then
writes NOTHING: the old fallback to the raw session key produced a cursor under a
key no unread surface ever looks up, and the same cache events re-fire once the
lists land.

**Only `observerAdded` + `updated` count as "viewed"** (`VIEWED_EVENTS`), and the
exclusion is load-bearing, not tidiness: React Query emits
`observerOptionsUpdated` on EVERY RENDER of a component holding the query, and
each mark stamps a fresh `Date.now()`, so marking on those turned the tracker
into a render-driven write. Harmless while only the sidebar subscribed to the
cursor store (it observes no chat history, so the cascade died), it became an
infinite update loop the moment a second surface subscribed — store change →
board re-render → options updated → new cursor → store change. Any new
subscriber to `useReadCursorStore` depends on this filter.

### Surfaces

- **Completion notifications** — `app/src/hooks/completion-notification.ts` gates
  the send on `shouldNotifyCompletion`. Fails OPEN (unknown mission, unattributed
  mission, signed-out user all notify) and reads `selfId` at FIRE time, since a
  latch can outlive a sign-in by its grace window.
- **@mention pings** — `app/src/hooks/use-mention-notifications.ts`, once per
  aggregate entry via the `notifiedAt` watermark.
- **Sidebar** — `AgentActivitySummary.unreadCount` beside `needsYouCount`,
  rendered as a quiet `UnreadDot` (a filled `bg-action` dot), deliberately a
  different shape and weight from `NeedsYouChip`: "something new here" vs "act
  now". Zero when signed out or single-player: `use-agent-activity-summaries.ts`
  omits the `unread` option entirely unless `isMultiplayer(capabilities)`, and
  `buildAgentActivitySummaries` leaves every count at 0 without it.
- **Mentions inbox** — Mission Control's third mode
  (`app/src/components/board/mentions-inbox.tsx`), hidden entirely when
  `!isMultiplayer(capabilities)`. `MissionControlToolbar` split into
  `mission-toolbar-actions.tsx` + `mission-agent-filter.tsx`; the mode controls
  are presence-gated (`onToggleMentions` absent = no chrome).

  **The pill counts a narrower thing than the rows show.** A row's dot is
  `isUnreadForMe` (mention OR ambient movement); the pill's number is
  `mentionOutstanding` (a mention strictly newer than my cursor for that
  conversation) — because the control says "N unread mentions", and a mission
  that merely moved is not somebody typing your name. `MentionInboxRow` carries
  both booleans so neither surface has to re-derive the other's rule.

- **Mission cards** — REMOVED (2026-07-30, inventory `mission-card` v51). The
  per-mission card dot (`KanbanItem.unread`, `ui/board/src/kanban-card-unread.ts`,
  the `use-board-unread.ts` join) was cut pending a proper rebuild — it fired
  too broadly to be a trustworthy signal. The read-cursor model and
  `isUnreadForMe` STAY: the sidebar count and the mentions inbox still consume
  them, and a rebuilt card indicator should start from the same model.

E2E: `packages/web/e2e/mentions-inbox.spec.ts` (inbox + read-cursor persistence
when a mission is opened).

---

## engine-client types + methods

Wire types in `ui/engine-client/src/types.ts`: `OrgRole`, `OrgMember`
(+ optional `displayName`/`photoUrl`), `UserProfile`/`UserProfilesResult` (the
`GET /v1/org/profiles` shape), `OrgPerson` (the `GET /v1/org/people` directory
row) + `MessageMention` (HOU-944), `OrgInfo`, `OrgInvite`, `AddOrgMemberResult`,
`AgentAccess`, `AgentAssignment`,
`AgentSettings` (`allowedToolkits` + `allowedModels` — the agent's whole ceilings;
policy is per agent only, there is no `OrgSettings` type), `AuditEntry`, `UsageRow`,
`AgentModelChoice` / `AgentModelChoiceInfo`. `Agent` gains multiplayer-only
`assigned` / `assignedUserIds` / `access` / `assignments`. All hand-maintained
against the gateway (the server is source of truth). Methods in `client.ts`:
`getOrg`, `getOrgProfiles` (404-degrades to `{}`), `getOrgPeople` (the mention
directory; 404-degrades to `[]`), `addOrgMember`, `deleteOrgInvite`,
`removeOrgMember`, `setOrgMemberRole`,
`setAgentAssignments` (v2 `{assignments}` or legacy `{userIds}`), `getAgentSettings`
/ `setAgentSettings`, `getAgentModelChoice` /
`setAgentModelChoice`, `orgAudit`, `orgUsage`, and
`connectIntegration(provider, toolkit, agent?)`. (`getOrgSettings`/`setOrgSettings`
and the `use-org-settings.ts` hook chain were removed with the org ceilings.)

---

## i18n

All Teams copy lives in the `teams` namespace
(`app/src/locales/{en,es,pt}/teams.json`, registered in `app/src/lib/i18n.ts`).
Top-level groups: `agentAdmin` (`groups` incl. the inline `general` card, `rows`,
per-agent `models` ceiling, inline `values`),
`managedAgent`, `integrations` (`allowlist` = the per-agent app ceiling +
`notAllowed`; the org-ceiling `integrations.orgAllowlist` and the whole `models`
group were deleted with the org ceilings 2026-07-16), `permissions`, `org`, `share`,
`people`, `activityTab`, `usageTab`, `agentsTab`. (The AI Models hub's own strings
live in the separate `aiHub` namespace.)

The **`permissions.*`** block backs Settings > Permissions: `title`, `subtitle`,
`agentTabs.{people,integrations,models}` (the three agent-detail tab labels),
`agentPeople.{none,noneHint,changeAccess,readOnlyHint,viewerOnly,empty.{title,body}}` (the
per-agent People tab; `readOnlyHint` + `viewerOnly` back the agent-tab read-only view). The
read-only editors also add `integrations.allowlist.readOnlyNote` + `agentAdmin.models.readOnlyNote`.
The agent workspace **Settings tab label** lives in the `agents` namespace like every other tab:
`agents:tabLabels.job-description` (en "Settings" / es "Configuración" / pt "Configurações").
(`permissions.tabs.*`, `permissions.people.*`, `permissions.defaults.*`, and
`permissions.agents.listTitle` were deleted — with the top-level People/Agents split and
the "Defaults for every agent" card.) The agent detail REUSES `share.*` copy (levels,
`ownerAccess`, `you`, `selfNote`, `selfLockout.*`) + `org.agentDetail.*` (the header +
manager-only note); `org.memberDetail.*` and `people.roster.openLabel` were DELETED with
the per-person lens. Deleted with their
removed sections: `org.tabs.{agents,allowedIntegrations,allowedModels}`,
`org.index.rows.{agents,allowedIntegrations,allowedModels}`, `org.index.groups.permissions`,
`org.index.values.{agents_*,allApps,appsAllowed_*,allModels,modelsAllowed_*}`. `org.subtitle`
(membership/insights/billing wording) and `org.agentDetail.subtitle` were updated. Outside the
`teams` namespace: HOU-788 moved the labels into `settings` —
`settings:nav.{usage,permissions,organization}` + `settings:index.rows.*` +
`settings:index.groups.{workspace,team}`; `shell:sidebar.{usage,permissions}`,
`shell:uiTour.steps.{permissions,organization}` and `teams:org.nav` were DELETED
with the sidebar entries and their tour steps.
(There is also a separate `org` namespace for pre-v2 org strings.) See
`i18n.md`.
