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
- `canSeeAiModelsPage(caps)` — the gate for the global **AI Models hub**
  (sidebar nav, render branch, tour step): a Teams **plain member** → false, else
  true. Unlike Composio, AI provider connections are **org-level** (one credential
  per org — whoever connects, every member's agents work; `cloud/docs/contracts/C6`),
  so a member has no per-provider account to house anywhere — they pick their model
  per agent in the composer. The hub is therefore owner/admin-only in Teams; a member
  loses its nav entirely. This also removes a dead affordance: a member's
  provider-connect POST already 403s at the gateway. (There is no org-wide model
  ceiling; model policy is per agent, in the **Permissions** view's per-agent
  detail (its AI Models tab), below.)
- `GRANTABLE_ROLES = ["admin", "user"]` — owner is never handed out from the UI
  (ownership transfer is out of scope for v1).

---

## Admin page (the org dashboard)

Top-level view labelled **"Admin"** in the UI (`teams:org.nav`/`org.title`;
"Admin" / "Administración" / "Administração"). The internal id, dir, and gate are
UNCHANGED: `ORGANIZATION_VIEW_ID = "organization"`
(`app/src/components/organization/`), rendered only when
`canSeeOrganization(caps, activeSpaceIsTeam)` (multiplayer owner/admin, AND — on
a Spaces host — a TEAM active space). The sidebar nav entry and the
`workspace-shell` render branch both guard on it, so it never mounts for a plain
member, single-player, or in the personal space of a Spaces host.

**Personal space hides Admin + Permissions (HOU-824).** On a C8 Spaces host the
personal space is single-player semantics: non-invitable (the gateway 403s a
member-add with `personal_space`), no roster, no policy. So Admin and Permissions
are TEAM-space surfaces there — `canSeeOrganization` returns false whenever the
active space is personal (`!isTeamWorkspace(current.id)`), whatever the role. The
two call sites (`workspace-shell.tsx`, `sidebar.tsx`) derive `activeSpaceIsTeam`
from the active workspace id and thread the resulting `showOrganization` boolean
everywhere it gates (the render branches, the `blockedTopLevelView` fallback that
resets a stale personal-space `viewMode` to the dashboard, and the org/permissions
UI tour steps). On a non-spaces multiplayer host (legacy Teams v2, exactly one
org) `activeSpaceIsTeam` is irrelevant and behavior is unchanged.

**Now membership + insights + billing ONLY.** All policy (per-agent access and
per-agent ceilings) moved OUT to the new top-level **Permissions** view (next
section). The Admin page is what remains: who's in the org, what they're doing,
and the bill.

**Index/detail grammar (settings-page style), NOT a tab strip.** The landing
screen is `admin-index.tsx`: grouped, self-describing rows (`SettingsCard` /
`SettingsRow` reused from `components/settings/settings-row.tsx`), each with an
icon, a title (`teams:org.tabs.<id>`), a one-line description
(`teams:org.index.rows.<id>`), and an at-a-glance value chip
(`teams:org.index.values.*`: member count). Groups: a **People** card
(membership), an **Insights** card (Activity, Usage), and a **Billing** card
(when in scope). The old **Permissions** group (Agents, Allowed apps, Allowed AI
models) is GONE — it now lives in the Permissions view. Clicking a row opens its
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
  agent access is managed per agent in the Permissions view (each agent's People tab).
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

## Permissions view (the one policy home)

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

Top-level view labelled **"Permissions"** — everything policy, FULLY AGENT-CENTRIC:
pick an agent, then manage who can use it and what it can use.
`PERMISSIONS_VIEW_ID = "permissions"`
(`app/src/components/permissions/id.ts`), registered in
`app/src/lib/top-level-views.ts` (`TOP_LEVEL_VIEWS` + `blockedTopLevelView`, which
shares the Organization gate exactly). Gated by `canSeeOrganization(caps,
activeSpaceIsTeam)` (multiplayer owner/admin, and a TEAM active space on a Spaces
host) — the IDENTICAL gate to the Organization view, threaded through the same
`showOrganization` boolean. The sidebar
nav item (`app/src/components/shell/sidebar-chrome.tsx`, `buildSidebarNavItems`) is a
`ShieldCheck` lucide icon, label `shell:sidebar.permissions`, placed right BEFORE the
Organization item (both inside the `showOrganization` block). Render branch + tour
step (`nav-permissions`) live in `app/src/components/shell/workspace-shell.tsx`.

`permissions-view.tsx` is a shell: it loads `useOrg(true)` once (roster + role), owns
the drill-in as an `{agentId, tab}` pair (id-not-snapshot so a store reload keeps the
detail on the live row), and renders a `PageHeader` ("Permissions") + the agent list
(`agents-list.tsx`) DIRECTLY — no top-level tab strip. The drill-in reuses
`../organization/admin-detail-screen` (`AdminDetailScreen` back-bar, back label
"Permissions").

**Deep-linking** — `permissions-nav-store.ts`: zustand `usePermissionsNav` with
`{ requestedAgentId; requestedAgentTab: PermissionsAgentTab|null; requestAgentDetail(agentId, tab?); clearRequested }`.
The role-aware blocked-app CTA calls `requestAgentDetail(agent.id, "integrations")` so it
lands straight on that agent's Integrations tab (where the app-enable fix lives); the view
consumes the request one-shot (initial mount + while open) and clears it (see the
Integration allowlist ceiling section, Part B).

**Agent detail — three tabs** (`agent-detail.tsx`, takes `{ agent, members, initialTab? }`):
a `PageHeader` (agent avatar + name + "Open agent") over the shared
**`AgentPermissionsPanel`** (`permissions/agent-permissions-panel.tsx`, `{ agent, members,
initialTab?, readOnly }`): `@houston-ai/core` `Tabs variant="line"` with
**People | Integrations | AI Models** (labels `permissions.agentTabs.{people,integrations,models}`;
`defaultValue = initialTab`, default `"people"`). In the top-level drill-in the whole detail is
gated on `isAgentManager(caps, agent)` — a visible-but-not-manager admin gets
`org.agentDetail.managerOnly` instead of the panel, and the panel renders `readOnly={false}`.

**Two fronts, one target — the agent's OWN Permissions tab.** The SAME `AgentPermissionsPanel`
also mounts as a per-agent workspace tab (`components/tabs/agent-permissions-tab.tsx`, built-in
`agent-permissions`), so it is visible to **everyone who can open the agent** — read-only when the
viewer can't manage it — and a user always sees why their agent can or can't use something. It is
registered in `standard-tabs.ts` (`PERMISSIONS_TAB_ID = "agent-permissions"`) and **`teams`-gated**
in `visibleAgentTabs` (`caps?.teams === true`), so it never appears on single-player/self-host
(no ceilings, no roster). The tab id is deliberately NOT `"permissions"`: agent tab ids share the
`viewMode` string space with top-level view ids, and `PERMISSIONS_VIEW_ID = "permissions"` already
owns that name (the top-level drill-in), so reusing it would shadow the view in `workspace-shell`.
(This inverts the `integrations` precedent, where the TAB owns the short name and the VIEW is
`integrations-home`; here the VIEW owns it, so the tab is prefixed — the least-churn choice, since
the view id is referenced across many files while the tab is new and unreleased.) The tab fetches
the roster via `useOrg` and renders `readOnly = !isAgentManager(caps, agent)`; managers get the
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
present; PLUS the agent's OWN `agent-permissions` tab: a manager's editable round-trip and a
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
Manager control) lives in **Permissions > agent detail > People** (`agent-people-tab.tsx`)
— see the Permissions view section above. It shares the roster math in
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
- **Switch = full cache drop** (`app/src/stores/workspaces.ts` `setCurrent` →
  `resetCacheForSpaceChange`, `app/src/lib/space-cache.ts`): query keys are NOT
  org-scoped (the active space is only a request header), so team A and team B
  collide on the same key. On a REAL space change `setActiveOrg` returns `true`
  and the store calls `queryClient.removeQueries()` (not `invalidate`, which would
  leave inactive-query data serving the prior space's rows on navigation, a
  cross-tenant flash). Everything (including `capabilities`, whose `role` is
  per-space) refetches clean under the new space, and the event stream is
  re-established so the new `?org=` applies. A same-space reselect, and every
  switch on a personal-only host (every id maps to `null`), is a no-op. First
  load pins the active space before the first fetches fire (no reset needed then).
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
  In a Teams org the composer shows them to EVERYONE, clamps the option list to
  the agent's `allowedModels` ceiling, and reads+writes the caller's PERSONAL
  per-agent choice (`useAgentModelChoice` / `useSetAgentModelChoice`) — never the
  shared agent config. The gateway clamps every turn to the acting user's choice
  (client picker is convenience only). A single-model ceiling renders read-only
  but still visible. Single-player / self-host is unchanged: shared config, no
  ceiling. The pure decision + clamp + resting-pin helpers live in
  `app/src/lib/model-selector-lock.ts` (`modelSelectorDecision`, `isModelAllowed`,
  `resolvePersonalModelPin`, and `hiddenModelCount`, the count of DISTINCT blocked
  models across provider rows); the composer wires them in `use-agent-chat-panel.tsx`.
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
  editor). The whole AI-hub catalog is the selectable universe (there is no org-wide
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
  shared agent (`gateway.agent_model_choices`), read/written by the composer pickers in
  multiplayer (see "Manager-only configure surfaces" above), never the shared config.
- **Enforcement** — the gateway is the sole enforcer: it clamps every turn to the acting
  user's choice ∩ ceiling and strips any client-supplied model/provider. The client picker
  is convenience only.
- Types: `AgentSettings.allowedModels` (the agent's whole model ceiling),
  `AgentModelChoice` (`{provider, model, effort?}`),
  `AgentModelChoiceInfo` (`{choice, allowedModels}`).
- Client: `getAgentModelChoice` (404-degrades to `null` off-Teams) / `setAgentModelChoice`
  (`GET`/`PUT /agents/:slug/model-choice`); `setAgentSettings` widened to
  `{allowedToolkits?, allowedModels?}`. Hooks: `useAgentModelChoice` /
  `useSetAgentModelChoice` (`hooks/queries/use-agent-model-choice.ts`),
  `useSetAgentAllowedModels` (`hooks/queries/use-agent-settings.ts`).

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
per agent only), grants are pruned when the ceiling shrinks, and a per-agent
connect carries the agent slug so the gateway checks the allowlist and auto-grants
on success.

**The per-agent ceiling has one frontend home** — the shared presentational
`AllowlistEditor` (`app/src/components/integrations/allowlist-editor.tsx`):

- **Per-agent ceiling** — Agent Settings > **Access** > **Apps**
  (`AgentAllowlistSection`, manager-only). The whole catalog is the selectable
  universe (there is no org-wide ceiling to narrow it). Client: `getAgentSettings` /
  `setAgentSettings`. Copy under `teams:integrations.allowlist.*`. The per-agent app
  ceiling ALSO surfaces (via `AgentAdminIntegrations`) in the Permissions agent detail's
  Integrations tab (`permissions/agent-detail.tsx`), same editor, same wire.

The global Integrations page has no ceiling to apply (policy is per agent), so it
never locks a row — it's the personal catalog for every member. Per-agent GRANT
toggles are a separate concept and live only on the global Integrations page's app
detail modal (the ONE by-app grants lens; the Settings row deep-links there), never
in the ceiling editor.

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
— `PERMISSIONS_VIEW_ID` + a `usePermissionsNav` request. The gate is `canManageAgent`
(agent-manager AND `canSeeMembers`); members and non-admin managers keep the old copy (the
resolver returns `undefined`). Authority lives in `integrations/blocked-ceiling.ts`
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
(`{id, label, imageUrl?}`) + a `KanbanPeople` overlapping face stack (max 3 faces
+ a "+N" chip, initials fallback when no/broken image) render on cards
(`kanban-card.tsx`) and the detail panel (`kanban-detail-panel.tsx`). Props-only,
i18n-agnostic (label passed in). Alongside the agent filter, the app adds
`mission-person-filter.tsx` — a dropdown of **Everyone / My missions / each person
on the board** (roster from `distinctBoardPeople`), itself gated on
`isMultiplayer` and a signed-in user.

**Teammate names + photos.** The Supabase `public.profiles` table + avatar storage
that used to back these were **retired with Supabase auth** — RLS `auth.uid()` can't
match Firebase (GCIP) uids, so the profiles source no longer resolves (see
`knowledge-base/auth-migration.md`). `useUserProfiles`
(`app/src/hooks/queries/use-user-profiles.ts`) is therefore **stubbed**: teammate
names fall back to **initials** (from the stored `name` or the id slice) until a
gateway-backed profile source lands, and avatars are absent. i18n:
`dashboard:peopleFilter.*`, `board:people.label` (en/es/pt).

## engine-client types + methods

Wire types in `ui/engine-client/src/types.ts`: `OrgRole`, `OrgMember`,
`OrgInfo`, `OrgInvite`, `AddOrgMemberResult`, `AgentAccess`, `AgentAssignment`,
`AgentSettings` (`allowedToolkits` + `allowedModels` — the agent's whole ceilings;
policy is per agent only, there is no `OrgSettings` type), `AuditEntry`, `UsageRow`,
`AgentModelChoice` / `AgentModelChoiceInfo`. `Agent` gains multiplayer-only
`assigned` / `assignedUserIds` / `access` / `assignments`. All hand-maintained
against the gateway (the server is source of truth). Methods in `client.ts`:
`getOrg`, `addOrgMember`, `deleteOrgInvite`, `removeOrgMember`, `setOrgMemberRole`,
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

The **`permissions.*`** block backs the Permissions view: `title`, `subtitle`,
`agentTabs.{people,integrations,models}` (the three agent-detail tab labels),
`agentPeople.{none,noneHint,changeAccess,readOnlyHint,viewerOnly,empty.{title,body}}` (the
per-agent People tab; `readOnlyHint` + `viewerOnly` back the agent-tab read-only view). The
read-only editors also add `integrations.allowlist.readOnlyNote` + `agentAdmin.models.readOnlyNote`.
The agent workspace **Permissions tab label** lives in the `agents` namespace like every other tab:
`agents:tabLabels.agent-permissions` (en "Permissions" / es "Permisos" / pt "Permissões").
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
`teams` namespace: `shell:sidebar.permissions` + `shell:uiTour.steps.permissions` were added,
and `shell:uiTour.steps.organization.body` reworded (no more policy mention).
(There is also a separate `org` namespace for pre-v2 org strings.) See
`i18n.md`.
