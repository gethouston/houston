# Teams (multiplayer orgs) — roles, gates, Admin, Permissions, sharing

The client side of Houston's hosted orgs: roles, per-agent access, the org dashboard,
the Share dialog, invites/audit/usage.

> **The gateway is the sole enforcer.** Every gate here only HIDES an affordance the
> caller can't act on. The gateway classifies each request (use vs configure), clamps
> access to the org role, and 403s anything a role/access level isn't allowed to do —
> the client NEVER re-clamps and a stale/spoofed field can't widen power.

Server contracts: `cloud/docs/contracts/C3-org-role-model.md` (roles/assignments, v2
matrix), `C7-teams.md` (the v2 layer + the per-agent allowlist),
`C8-spaces-billing.md` (spaces), `C13-agent-teams.md` (agent teams). Wire surface:
`cloud/INTEGRATION.md`. *(`C4-grants.md` is RETIRED — the per-`(user, agent)` grants
layer no longer exists on either side.)*

Everything here is **capability-gated**: absent/single-player hosts (desktop,
self-host) never mount any of it, and the org routes 404 → the reads degrade to
`[]`/`null` silently.

Related docs, split out by topic:

| Doc | Topic |
| --- | --- |
| `spaces.md` | C8 Spaces — the `org:<slug>` switcher, active-space pin, cache drop, create-team, invite inbox, share-via-team, seat billing + trial + degrade |
| `ai-accounts.md` | Per-user AI accounts, the per-agent model ceiling, per-user model choice |
| `mission-attribution.md` | Face stacks, chat sender attribution, @mentions, read cursors, notification relevance |
| `teams-ui.md` | The CLIENT-side agent teams (sidebar grouping + the `team` screen). A different, finer thing than an org |
| `agent-settings.md` | The one per-agent settings page this doc's two doors lead to |

> **Test it locally with `pnpm dev`** — the web pane (:1430) runs the full multiplayer
> surface against the local Go gateway with real Google sign-in and engines as local
> processes (`dev-loop.md`). The kind loop is only for pod/PVC/NetworkPolicy fidelity
> before a release.

---

## Feature detection

`Capabilities` (`ui/engine-client/src/types.ts`) is the fuller type — 18 fields; the
`packages/protocol` copy lags and lacks several. The six that matter here, all optional
so every existing single-player/self-host profile stays valid:

- **`multiplayer?: boolean`** — this deployment runs in org mode (members, roles,
  assignments). Absent/false = single personal workspace. Every gate in
  `app/src/lib/org-roles.ts` short-circuits to "single-user owns everything" when off.
- **`role?: OrgRole`** — the caller's own org role, present when `multiplayer`.
  **Per ACTIVE space (C8)**: a user belongs to many orgs, so `caps.role` is the role in
  the *currently active* space. Capabilities MUST be re-fetched on every space switch —
  the switch drops the whole query cache, so `role` reloads automatically (`spaces.md`).
- **`teams?: boolean`** — feature-detect for the v2 surface (per-agent access levels,
  share dialog, org dashboard).
- **`spaces?: boolean`** — the C8 Spaces surface. Read via `hasSpaces(caps)`.
- **`agentTeams?: boolean`** — the C13 server-backed agent teams. Read via
  `hasAgentTeams(caps)` (`teams-ui.md`).
- **`computeUsage?: boolean`** — backs Settings > Time worked (`showTimeWorked`).

---

## Roles and access levels — two orthogonal axes

**Org role** = authority in the org. **Agent access** = authority on one shared agent.

- **`OrgRole = "owner" | "admin" | "user"`** — UI labels **Owner / Manager / Member**.
  `owner` is the single billing/root seat; `admin` manages members + agents; `user` is a
  plain seat that can only use assigned agents.
- **`AgentAccess = "manager" | "user"`** — per-agent, on `gateway.agent_assignments`.
  `manager` may reconfigure the agent (instructions, skills, model, allowed apps,
  assignments); `user` may only use it. Owner is always `manager` on every org agent.
- The admin **"see/manage all agents"** rule is GONE: an admin only sees agents assigned
  to them, and is only an agent-manager where their effective `access === "manager"`.
  Per-agent authority is the `access` level, not mere assignment.

### The gate modules

Pure, DOM-free, unit-tested, split by shape. Caps-only org gates in
`app/src/lib/org-roles.ts` (`app/tests/org-roles.test.ts`); per-agent authority gates
that also take `Pick<Agent, "access" | "assigned">` in `app/src/lib/agent-access.ts`
(`app/tests/agent-access.test.ts`). All take `Capabilities | null`.

| Gate | Rule |
| --- | --- |
| `isMultiplayer(caps)` | `caps.multiplayer === true` |
| `orgRole(caps)` | the role, or `null` off-multiplayer. A missing role on a multiplayer host is treated as the least-privileged `user` — never widens |
| `canCreateAgents(caps)` | owner/admin (single-player: always). The sidebar "New Agent" reads it via `useCanCreateAgents` |
| `canSeeMembers(caps)` | owner/admin. Also the exact gate for the org dashboard (`canSeeOrganization` delegates to it) |
| `canManageMembers(caps)` | **owner only**; admins see the roster read-only |
| `isAgentManager(caps, agent)` | the single per-agent authority gate: single-player true; org owner true; else `agent.access === "manager"`. It trusts `access` verbatim because the gateway already clamps a stale `manager` row for a `user` member before it reaches the wire |
| `canEditAgentConfig` | semantic alias of `isAgentManager` for config-edit call sites |
| `canManageAssignments(caps, agent)` | same gate; behind the Share block |
| `canSeeAiModelsPage(caps)` | **TRUE for everyone, always.** See below |
| `canSeeBillingTab(caps, activeSpaceIsTeam)` | Spaces host AND active team AND owner/admin (`spaces.md`) |
| `GRANTABLE_ROLES = ["admin","user"]` | owner is never handed out from the UI (ownership transfer is out of scope) |

- **The global Integrations page has NO role gate** — it is the personal catalog for
  every member in every mode.
- **`canSeeAiModelsPage` is unconditionally true** (since HOU-976). In a team space every
  turn runs on the AI account of the person who sent it, so a member's own account is the
  only thing that can answer them and the hub is the only surface where they connect it.
  No role can connect one on their behalf, so there is no owner/admin half left to gate
  (`ai-accounts.md`). The usage on a hub card is the VIEWER's own account; the space-wide
  roll-up lives in **Settings > Admin > Usage**, behind `canSeeOrganization`. **No role
  carries AI-credential authority in a team space.**
- **Settings > Time worked is NOT behind that gate** (HOU-790). It rides
  `capabilities.computeUsage` (`showTimeWorked`), so a plain member of a hosted-cloud team
  sees it. Safe because the gateway scopes `GET /v1/org/compute-usage` to the agents the
  caller can already reach. If that server scoping narrows or widens, revisit this gate
  with it.

### `useSurfaceGates` — the ONE hook

`app/src/hooks/use-surface-gates.ts` derives `activeSpaceIsTeam` from the active
workspace id and returns `{ showOrganization, showAiModels, showTimeWorked, ready }`.
The sidebar, the workspace shell and `SettingsView` all read it, so a gate can never be
tightened in one place and forgotten in another.

- **Personal space hides Admin + Permissions (HOU-824).** On a Spaces host the personal
  space is single-player semantics: non-invitable (the gateway 403s a member-add with
  `personal_space`), no roster, no policy. `canSeeOrganization` returns false whenever the
  active space is personal (`!isTeamWorkspace(current.id)`), whatever the role. On a
  non-spaces multiplayer host `activeSpaceIsTeam` is irrelevant and behavior is unchanged.
- **`ready` — the gates mean nothing until capabilities land.** They are computed from
  `capabilities`, which is `null` in flight, so an unresolved gate is indistinguishable
  from a denied one. Anything that merely HIDES an affordance may act early; anything that
  DROPS an open surface must wait. `SettingsView` routes through
  `settingsSectionGate(section, {…, ready})` (`lib/settings-sections.ts`), a tri-state
  `loading | blocked | visible`: a gated section holds its place behind a back bar +
  spinner while `ready` is false, and only a RESOLVED block falls back to the index.
  Without it every team-space switch dumped an owner out of an open Admin/Permissions
  section, because `resetCacheForSpaceChange` removes the capabilities query and the next
  render sees `null`. `blockedSettingsSection` is the inner rule and must not be called
  directly by a view.

---

## Admin (the org dashboard) — company context + membership + insights + billing

`org.title` ("Admin" / "Administración" / "Administração"), a TOP-LEVEL view in the
rail's Workspace band (`ORGANIZATION_VIEW_ID`); components in
`app/src/components/organization/`. Rendered only when
`canSeeOrganization(caps, activeSpaceIsTeam)`; `blockedTopLevelView` sends a stale
`viewMode` home when the gates resolve against it.

One header lozenge cluster (the shared page-header grammar with Integrations and the
team screen):

- `admin-header.tsx`: the identity lozenge (Building2 + "Admin") carries the screen's
  `<h1>` and opens Company context, the landing section, which titles itself in its
  body. People, Billing (when `canSeeBillingTab`), and Analytics follow as lozenges.
  Narrow widths collapse the cluster into a switcher naming the ACTIVE section.
  Lozenges carry `data-admin-section-tab`; the mounted body carries
  `data-admin-section-body` — the e2e helpers (`e2e/support/settings-nav.ts`) wait on it.
- Analytics is a drilled level: `admin-analytics-header.tsx` = `PageHeaderBackChip`
  (‹ + the destination's glyph + "Admin") + lens lozenges Activity (the drilled
  identity, text-only per the chip's drilled-header rules) / Usage / Time worked
  (only with `capabilities.computeUsage`). Lens state lives in `organization-view.tsx`,
  threaded as props to the header and the body.
- The rail's Admin row always opens the dashboard HOME through the org-nav one-shot pin
  (`requestTab(DEFAULT_ORG_TAB)`) — the same rail rule as a team row (its board) and
  Settings (its index). The C8 team-status banner deep-links Billing through the same
  store.
- Section set, order fixed by `orgTabIds` in `org-view-model.ts`:
  `OrgTabId = "companyContext" | "people" | "billing" | "analytics"`, Billing spliced
  after People when in scope. `organization-view.tsx` loads `GET /org` once and builds
  the shared `OrgViewContext` (`{org, role, isOwner}`); each section owns its data + UI.
- Per-agent policy lives in each team's Manage agents page.

Sections:

- **Company context** (`company-context-tab.tsx`) — the workspace half of standing
  context, drawn with the ONE standing-prose editor
  (`app/src/components/context/context-editor.tsx`: always-open box, saves on blur,
  the data layer owns the failure toast). The same component draws About me, an
  agent's Job description (agent settings), and the team context card.
- **People** (`members-tab.tsx` / `people-roster.tsx`) — roster + pending invites,
  **membership only**: owner mutates (add/remove/re-role, revoke invite), admin sees
  them read-only. Per-agent access is managed on the agent settings page's People
  section. This is the ONLY membership surface.
- **Analytics** (`analytics-tab.tsx`) — one measurement section; Activity (audit log,
  paged), Usage (per-agent/user message counters), and Time worked are its lenses.
- **Billing** (`billing-tab.tsx`) — `spaces.md` → *Billing surface*.

Tests: `org-view-model.test.ts` (section set, billing gate, lens set/resolve),
`context-editor.test.ts` (editor grammar), e2e helpers in `settings-nav.ts`.

---

## Settings > Permissions — the one policy home, fully agent-centric

Pick an agent, then manage who can use it and what it can use. **There is no top-level
People tab and no per-person lens**, and **no org-wide ceilings** — policy is per agent
only, and a new agent's effective allowlist is its OWN ceiling (`null` = every app/model,
the default).

- Section id `"permissions"` in `app/src/lib/settings-sections.ts`. Gated by
  `canSeeOrganization(caps, activeSpaceIsTeam)` — the IDENTICAL gate to Admin, through the
  same `showOrganization` boolean.
- The Settings index row (`components/settings/settings-index.tsx`) is a `ShieldCheck`
  Lucide icon, label `settings:nav.permissions`, in the "Team" group right AFTER Admin
  (both inside the `showOrganization` block, `data-testid="settings-row-permissions"`).
  `settings-section-body.tsx` mounts it with `backLabel`/`onBack`.
- `permissions-view.tsx` is a shell: it loads `useOrg(true)` once (roster + role), owns the
  drill-in as an `{agentId, section}` pair (id-not-snapshot, so a store reload keeps the
  detail on the live row), and renders a `PageHeader` ("Permissions") + the agent list
  (`agents-list.tsx`) DIRECTLY — no top-level tab strip. Both levels use the shared
  `shell/back-bar-screen.tsx` (`BackBarScreen`). It tracks `tab_opened` /
  `permissions:<section>` from the settings page's `onSectionShown`, i.e. the section
  actually ON SCREEN.
- **This door has no deep link.** Programmatic navigation to an agent's settings goes
  through the Team Settings door instead — `lib/open-agent.ts` `openAgentSettings` and its
  one-shot `team-view/team-settings-nav-store.ts` (`agent-settings.md`).
- The agent list is `app/src/components/permissions/agents-list.tsx`, rendering the shared
  `PermissionsAgentGrid` (`permissions/agent-grid.tsx`, also worn by Team Settings);
  helpers `org-agents-model.ts` alongside; `org-roster.ts` + `org-time.ts` stay in
  `organization/` (cross-dir import).

### Agent detail — two doors, one page

`permissions/agent-detail.tsx` takes `{ agent, initialSection?, onSectionShown? }` and
renders a `PageHeader` (agent avatar + name + the agent's **Share** button + "Open agent")
over **`AgentSettingsPage`** — the ONE per-agent configuration surface
(`app/src/components/agent-settings/`, documented in **`agent-settings.md`**).

- **Two doors:** **Team Settings → the agent's row** (`team-view/team-settings.tsx`, every
  deployment and single player's only door) and **Settings > Permissions → the agent's
  row** (multiplayer owner/admin only). Programmatic navigation always takes the Team
  Settings door (`openAgentSettings`, gated on `canOpenAgentSettings`).
- **Manager authority decides the FACE, not access.** `isAgentManager(caps, agent)` false
  renders the SAME page `readOnly`, so an admin who can see an agent but does not manage it
  reads every section instead of hitting a dead end. Access sections still need multiplayer
  (`agentAccessSections`), so single-player/self-host shows Context + Skills and no access
  rows.
- **The header carries Share.** `AgentShareSurfaces` lives on this page: the manage sheet
  in a team space, the read-only "who has access" list for a member, and the C8
  share-via-team flow in a personal space, picked by
  `agentShareSurface(caps, agent, isPersonalSpace)`.

**The page's own vocabulary** (`agent-settings/agent-settings-nav.ts`) — the rail has two
groups and six sections:

- `AgentSettingsGroupId = "context" | "permissions"`, built by `agentSettingsGroups(caps)`.
- Sections: `job-description | learnings | people | integrations | models | skills`.
  `SECTION_GROUP` puts job-description + learnings in **Context**; people, integrations,
  models, skills in **Permissions**.
- Rail titles are pinned explicitly in `agent-settings-rail.tsx` `SECTION_TITLES` so each
  key is type-checked and locale-validated: `learnings` → `agentAdmin.rows.knowledge.title`
  ("Memory"), `people` → `agentAdmin.rows.people.title` ("People with access"),
  `integrations` → `agentAdmin.rows.integrations.title` (**"Apps"**), `models` →
  `agentAdmin.rows.model.title` (**"AI models"**); `job-description` and `skills` reuse
  `agents:subTabs.instructions` / `agents:subTabs.skills`. ("Allowed models" exists only as
  an in-section sub-heading, `agentAdmin.models.allowedHeading`.) Group titles render only
  when there is more than one group.

**Read-only rule.** `readOnly` threads to every section: People rows drop to static level
labels with NO control (`agent-person-row.tsx` `readOnly`, plus a muted
`permissions.agentPeople.readOnlyHint`); the Integrations + AI Models editors use their own
`readOnly` mode (controls disabled, the "Add" list hidden, a muted `readOnlyNote`); Skills
drops its discovery tabs. No hover gating anywhere.

**Roster degradation for a plain member.** The gateway serves `members` only to owner/admin
(`OrgInfo.members` is absent for org role `user`), so a member's People roster arrives
empty. Rather than a misleading "no people yet" empty state, it shows the honest viewer
line `permissions.agentPeople.viewerOnly` ("You can use this agent. Someone who manages it
can change who has access."). The pure decision is `agentPeopleView(rowCount, readOnly)` in
`agent-people-model.ts` (`"roster" | "viewerOnly" | "empty"`, unit-tested). An admin who
isn't the agent's manager still gets the full roster, read-only.

**People section** (`agent-settings/agent-people-tab.tsx`) — WHO can use THIS agent: every
org member is a row (avatar + email + org-role chip) with a **None / Can use / Manager**
control (`agent-person-row.tsx`; owner renders static "Owner, always has access").

- Read + write reuse the Share dialog's roster math (`components/agent/agent-access-model.ts`)
  VERBATIM via the thin pure model `agent-people-model.ts`: `buildAgentPeople` wraps
  `buildSharePeople` (everyone-agent expands to the whole team, owner is always manager,
  members off the roster read `none`); `writeAgentPerson` wraps
  `buildSharePeople` + `applyShareAction` (so an everyone-agent MATERIALIZES into an
  explicit roster on first edit exactly as the dialog does, and the owner is never
  stripped); `agentPersonNeedsConfirm` delegates to `needsSelfLockoutConfirm`.
- Writes go through the section's ONE `useShareAgent` instance (optimistic set-replace
  `PUT /v1/agents/:slug/assignments`, passed in from `agent-settings-people.tsx` so the
  team-wide access choice and the rows share one write channel). A self-lockout is
  confirm-gated. Manager is disabled for org-role `user` members (`canPersonBeManager`;
  the gateway 400s `manager_requires_admin`).
- Copy: `share.levels.*` + `share.ownerAccess` / `share.you` / `share.selfNote` +
  `permissions.agentPeople.*`. Unit test `app/tests/agent-people-model.test.ts`.

**Apps section** — the agent's app ceiling (`AgentAdminIntegrations`, heading "Which apps
can this agent use?"). **AI models section** — the agent's model ceiling
(`AgentAdminModel`, `ai-accounts.md`). Both editors gate their edit affordances on the
page's `readOnly`.

Tested: e2e `packages/web/e2e/permissions.spec.ts` — the agent list → the settings-page
drill-in and its six rail items; both directions of the team-wide access choice and their
confirms; the static everyone-mode roster; People Can use→No access round-trip; the Apps
ceiling round-trip; AI models present; Context group switching; a non-manager admin's
read-only drill-in; PLUS the SAME page through Team Settings (`openAgentSettings` in
`e2e/support/team-nav.ts`): a manager's editable round-trip, a role-`user` member's
read-only view + viewer-line degradation, and a plain member who cannot reach the page at
all. Fake host: `/__test__/org` (multi-member roster + fleet with per-agent
`assignments`/`access`; `/v1/org` omits the roster for role `user`, mirroring the gateway)
+ `PUT /v1/agents/:slug/assignments` / `settings`.

---

## Share dialog — `app/src/components/agent/agent-share-dialog.tsx`

- Google Drive-style Share sheet for one agent: people with access, each a **Manager /
  Can use / Remove** control, plus a member picker to add someone.
- Backed by `setAgentAssignments` v2 (`{userId, access}[]`) with an optimistic store patch
  + rollback (`use-share-agent.ts`). Pure model `agent-access-model.ts` handles
  self-lockout confirmation (removing/demoting yourself).
- Render gated by `canManageAssignments`; the gateway is the enforcer.
- Sharing a **personal** agent has no members to assign, so that path opens the
  **share-via-team** pipeline instead (`spaces.md`).
- Its roster math is shared with the agent settings People section via
  `agent-people-model.ts`, so access is never derived two ways.

---

## Manager-only configure surfaces

When the caller is a plain member of a shared agent (`!isAgentManager`):

- **Agent Settings is unreachable** for a caller who fails
  `canOpenAgentSettings(caps, agent, team?)` (`app/src/lib/agent-nav.ts:92`). With a
  `team` it delegates to `visibleTeamSectionsForTeam(caps, team).includes("settings")`;
  omitted or `null`, it falls back to the org-wide
  `canSeeTeamSettings(caps) || isAgentManager(caps, agent)`, which is never WIDER. The
  third argument exists because a server-teams explicit team OWNER may configure a team's
  agents without being an org admin — only the per-team gate knows that (`teams-ui.md`).
- Team Settings is the door EVERY deployment has (Settings > Permissions is the second,
  and strictly narrower), so that section's gate IS the page's gate: no affordance may
  render without making that check first. The section is decided PER TEAM — gating it on
  the org role alone took every configure surface away from the very person the gateway
  lets configure that agent.
- **A plain member (managing no agent of the team) gets NO Settings row and NO read-only
  Context.** Intended product behaviour: for them the configure page does not exist rather
  than existing read-only. Inside the page, `isAgentManager` decides the FACE (`readOnly`),
  never access.
- Name / color / delete live on the sidebar agent row, not a "General" section. The rail
  has exactly the sections `agentSettingsGroups(caps)` yields — **there is no per-agent
  Connect card** (the public-API "Use from other apps" section, `capabilities.apiKeys`,
  C10, was removed in HOU-806 because connecting external apps is a Routines concern). The
  pure `lib/agent-connect-model.ts` outlived it: only its `DEVELOPER_DOCS` links have a
  consumer, Settings > API keys (`components/settings/sections/api-keys.tsx`);
  `connectEndpoints` / `connectOrgSlug` have none outside
  `app/tests/agent-connect-model.test.ts`.
- **Model / effort pickers are NOT hidden or locked for members** — see `ai-accounts.md`.

The gateway 403s any configure-scope write regardless; these gates just avoid showing a
dead control.

---

## Integration allowlist ceiling

Members can only connect apps the agent allows. Full model: `integrations.md` §2.

- `effective = agentCeiling` (`null` = all, `[]` = none). There are **no org ceilings and
  no per-`(user, agent)` grants** — both layers were deleted from client, host and UI, so
  no surface carries a grant toggle, the app detail modal included.
- Now-disallowed toolkits are pruned from live connections when the ceiling shrinks, and a
  per-agent connect carries the agent slug so the gateway checks the toolkit against the
  allowlist on a successful OAuth.
- **One frontend home** — the shared presentational `AllowlistEditor`
  (`app/src/components/integrations/allowlist-editor.tsx`), mounted as
  `AgentAllowlistSection` in the agent settings page's **Apps** section (manager-only) and,
  through `AgentAdminIntegrations`, in the Permissions agent detail — same editor, same
  wire. The whole catalog is the selectable universe. Client: `getAgentSettings` /
  `setAgentSettings`. Copy `teams:integrations.allowlist.*`.
- The global Integrations page has no ceiling to apply, so it never locks a row.
  Connections are per USER and global: one connection serves every agent that person may
  use. **Usable = connected AND the person may use the agent AND the toolkit is inside
  that agent's app ceiling.**
- **Blocked is visible, never silently hidden — but the app ceiling has no surface left to
  say it on.** Both blocked-app affordances (the "Not allowed" disallowed section and the
  locked browse rows) lived on the per-agent Integrations TAB, deleted with the agent tab
  shell. The composer model picker's count footer is the only one still rendering. The
  principle stands and the mechanism survives unwired — reviving app transparency means
  finding it a new home, not rebuilding it (`integrations.md` §3).
- What remains for apps is the ceiling EDITOR, which reads as admin POLICY via
  `teams:integrations.allowlist.policyHelper`. Member connect surfaces keep
  account-connection language ("connected to your account"), never "allowed".

---

## Invites, members, audit, usage

- **Invites** — `addOrgMember(email, role)` → `POST /v1/org/members`
  (`packages/web/src/engine-adapter/cp/orgs.ts`), targeting the ACTIVE space;
  `403 personal_space` on a personal one (surfaced as the friendly `personalSpace` toast,
  and the invite box is hidden there per HOU-824). A known user is added directly
  (`AddOrgMemberResult.userId`); an unknown email creates a pending invite and the host
  answers **202 `{invited:true}`**. `OrgInvite` rows surface on `GET /org` for owner/admin;
  `deleteOrgInvite` revokes (owner only).
- **Acceptance is C8-shaped**: a user can belong to many teams. A NEW user's pending
  invites auto-accept oldest-first after the personal space is minted; an EXISTING user
  accepts/declines explicitly (invites ride `GET /v1/orgs`'s `invites`,
  `OrgInviteSummary`). Personal is ALWAYS minted, never replaced. The invitee-side surface
  is the **invite inbox** in `spaces.md`.
- **Member emails** — `OrgMember.email` populated on `GET /org` when the host exposes it;
  the roster shows them (with `displayName`/`photoUrl` when present —
  `mission-attribution.md`).
- **Audit** — `orgAudit({limit?, before?})` → `AuditEntry[]` newest-first (owner org-wide;
  admin filtered to their agents). Paging in `org-view-model.ts` (`AUDIT_PAGE_SIZE`,
  `nextAuditCursor`).
- **Usage** — `orgUsage(days)` → `UsageRow[]` (message count per agent/user/day).

---

## engine-client types + methods

Wire types in `ui/engine-client/src/types.ts`, all hand-maintained against the gateway
(the server is source of truth): `OrgRole`, `OrgMember` (+ optional
`displayName`/`photoUrl`), `UserProfile`/`UserProfilesResult`, `OrgPerson` +
`MessageMention`, `OrgInfo`, `OrgInvite`, `AddOrgMemberResult`, `AgentAccess`,
`AgentAssignment`, `AgentSettings` (`allowedToolkits` + `allowedModels` — the agent's whole
ceilings; there is no `OrgSettings` type), `AuditEntry`, `UsageRow`, `AgentModelChoice` /
`AgentModelChoiceInfo`. `Agent` gains multiplayer-only `assigned` / `assignedUserIds` /
`access` / `assignments`.

Methods in `client.ts`: `getOrg`, `getOrgProfiles` (404-degrades to `{}`), `getOrgPeople`
(404-degrades to `[]`), `addOrgMember`, `deleteOrgInvite`, `removeOrgMember`,
`setOrgMemberRole`, `setAgentAssignments` (v2 `{assignments}` or legacy `{userIds}`),
`getAgentSettings` / `setAgentSettings`, `getAgentModelChoice` / `setAgentModelChoice`,
`orgAudit`, `orgUsage`, `connectIntegration(provider, toolkit, agent?)`. C8 methods →
`spaces.md`.

---

## i18n

All Teams copy is the `teams` namespace (`app/src/locales/{en,es,pt}/teams.json`,
registered in `app/src/lib/i18n.ts`). Top-level keys: `agentAdmin`, `agentSettings`,
`agentTeams`, `integrations`, `org`, `permissions`, `share`, `people`, `activityTab`,
`usageTab`, `agentsTab`, `createTeam`, `shareViaTeam`, `moveResume`, `billing`, `degrade`,
`personalSpace`, `inviteInbox`, `teamView`. (The AI Models hub has its own `aiHub`
namespace.)

- **`agentAdmin.*`** — `title`, `rows` (the rail titles), `values`, `models` (the per-agent
  model ceiling, incl. `allowedHeading` + `readOnlyNote`), `integrations`. There is no
  `agentAdmin.groups`, no `agentAdmin.general`, and no `managedAgent` block anywhere.
- **`agentSettings.*`** backs the per-agent page: `railLabel`,
  `groups.{context,permissions}`, and
  `people.{question,helper,anyLabel,anyDesc,pickedLabel,pickedDesc,everyoneNote,confirmEveryone.*,confirmSpecific.*}`
  (the everyone-vs-specific-people choice and its two confirms; the destructive
  self-lockout confirm reuses `share.selfLockout.*`). Rail titles REUSE
  `agents:subTabs.*` + `agentAdmin.rows.*` rather than duplicating them.
- **`permissions.*`** backs Settings > Permissions: `title`, `subtitle`,
  `agentPeople.{none,noneHint,changeAccess,readOnlyHint,viewerOnly,empty.{title,body}}`.
- The agent detail REUSES `share.*` (levels, `ownerAccess`, `you`, `selfNote`,
  `selfLockout.*`) + `org.agentDetail.*`.
- Outside the namespace: `settings:nav.{timeWorked,permissions,organization}` +
  `settings:index.rows.*` + `settings:index.groups.{workspace,team}`. There is no
  `settings:nav.usage` — Time worked is `settings:nav.timeWorked`.
- See `i18n.md`.
