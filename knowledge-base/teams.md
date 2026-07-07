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

Optional so every existing single-player/self-host profile stays valid.

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

## Role matrix v2 — `app/src/lib/org-roles.ts`

Pure, DOM-free, unit-tested (`app/tests/org-roles.test.ts`). All take
`Capabilities | null`; agent gates also take `Pick<Agent, "access">`.

- `isMultiplayer(caps)` — `caps.multiplayer === true`.
- `orgRole(caps)` — the role, or `null` off-multiplayer. A missing role on a
  multiplayer host is treated as the least-privileged `user` (never widens).
- `canCreateAgents(caps)` — owner/admin (single-player: always). Sidebar "New
  Agent" is gated on it via `useCanCreateAgents`.
- `canSeeMembers(caps)` — owner/admin. Also the exact gate for the org
  dashboard (`canSeeOrganization` delegates to it).
- `canManageMembers(caps)` — **owner only**; admins see the roster read-only.
- `isAgentManager(caps, agent)` — the single per-agent authority gate:
  single-player true; org owner true; else `agent.access === "manager"`. It
  trusts `access` verbatim because the gateway already clamps a stale `manager`
  row for a `user` member before it reaches the wire.
- `canEditAgentConfig = isAgentManager` — semantic alias for config-edit call
  sites (instructions / skills / model / Agent Settings).
- `canManageAssignments(caps, agent)` — same gate; behind the Share block.
- `canManageAgentGrants` / `canEditAgentGrants` — per-agent integration grants,
  gated on the caller's own assignment (independent of manager authority; see
  `integrations.md`).
- `GRANTABLE_ROLES = ["admin", "user"]` — owner is never handed out from the UI
  (ownership transfer is out of scope for v1).

---

## Organization dashboard

Top-level view `ORGANIZATION_VIEW_ID = "organization"`
(`app/src/components/organization/`), rendered only when
`canSeeOrganization(caps)` (multiplayer owner/admin). The sidebar nav entry and
the `workspace-shell` render branch both guard on it, so it never mounts for a
plain member or single-player.

Four tabs (`ORG_TAB_IDS`, order fixed in `org-view-model.ts`):
**People / Agents / Activity / Usage**. `organization-view.tsx` is a
shell — it loads `GET /org` once, builds the shared `OrgViewContext`
(`{org, role, isOwner}`), and each tab owns its own data + UI:

- **People** (`members-tab.tsx`) — roster + pending invites. Owner mutates
  (add/remove/re-role, revoke invite); admin sees it read-only.
- **Agents** (`agents-tab.tsx`) — org agents with assignment counts.
- **Activity** (`activity-tab.tsx`) — the audit log, paged.
- **Usage** (`usage-tab.tsx`) — per-agent/user message counters.

---

## Share dialog — `app/src/components/tabs/agent-share-dialog.tsx`

Google Drive-style Share sheet for one agent. Lists people with access, each a
**Manager / Can use / Remove** control, plus a member picker to add someone.
Backed by `setAgentAssignments` v2 (`{userId, access}[]`) with an optimistic
store patch + rollback (`use-share-agent.ts`). Pure model
(`agent-access-model.ts`) handles self-lockout confirmation (removing/demoting
yourself). Render gated by `canManageAssignments`; the gateway is the enforcer.

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
  back-bar, and General card are gone).
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
  `resolvePersonalModelPin`); the composer wires them in `use-agent-chat-panel.tsx`.
- **Integrations tab** gates its edit affordances on `isAgentManager` /
  `canEditAgentGrants`.

The gateway 403s any configure-scope write regardless — these gates just avoid
showing a dead control.

---

## Allowed-models ceiling + per-user model choice

The model surface mirrors the integration allowlist: the manager sets a **ceiling**
(which models the agent may run on), and each member picks their own model **within**
it. (The E5 org-templates feature that used to live here was removed in E8.)

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
- Types: `AgentSettings.allowedModels`, `AgentModelChoice` (`{provider, model, effort?}`),
  `AgentModelChoiceInfo` (`{choice, allowedModels}`).
- Client: `getAgentModelChoice` (404-degrades to `null` off-Teams) / `setAgentModelChoice`
  (`GET`/`PUT /agents/:slug/model-choice`); `setAgentSettings` widened to
  `{allowedToolkits?, allowedModels?}`. Hooks: `useAgentModelChoice` /
  `useSetAgentModelChoice` (`hooks/queries/use-agent-model-choice.ts`),
  `useSetAgentAllowedModels` (`hooks/queries/use-agent-settings.ts`).

---

## Invites, members, audit, usage

- **Invites** — `addOrgMember(email, role)` → `POST /org/members`. A known user
  is added directly (`AddOrgMemberResult.userId`); an unknown email creates a
  pending invite and the host answers **202 `{invited:true}`**. Consumed
  atomically at the invitee's first sign-in (one-org-per-user unique index; see
  `auth.md`). `OrgInvite` rows surface on `GET /org` for owner/admin;
  `deleteOrgInvite` revokes (owner only).
- **Member emails** — `OrgMember.email` populated on `GET /org` when the host
  exposes it; the roster shows them.
- **Audit** — `orgAudit({limit?, before?})` → `AuditEntry[]` newest-first
  (owner org-wide; admin filtered to their agents). Paging in `org-view-model.ts`
  (`AUDIT_PAGE_SIZE`, `nextAuditCursor`).
- **Usage** — `orgUsage(days)` → `UsageRow[]` (message count per
  agent/user/day).

---

## Integration allowlist ceiling

Members can only connect apps the org + agent allow. See `integrations.md` §2
for the full model. In short: `effective = orgCeiling ∩ agentCeiling`
(`null` = all, `[]` = none), grants are pruned when a ceiling shrinks, and a
per-agent connect carries the agent slug so the gateway checks the allowlist and
auto-grants on success. Client: `getAgentSettings` / `setAgentSettings`
(agent ceiling, manager-only), `getOrgSettings` / `setOrgSettings` (org ceiling,
owner-only). UI under `teams:integrations.allowlist`.

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

**Teammate names + photos** resolve client-side from Supabase `public.profiles`
(an anon, column-scoped read of `user_id, name, avatar_url`) via `useUserProfiles`
(`app/src/hooks/queries/use-user-profiles.ts`), enabled only when configured +
multiplayer + at least one id, 5-minute `staleTime`. A fetch error surfaces
through React Query `isError` (no swallow); missing avatars are cosmetic and fall
back to initials. i18n: `dashboard:peopleFilter.*`, `board:people.label` (en/es/pt).

## engine-client types + methods

Wire types in `ui/engine-client/src/types.ts`: `OrgRole`, `OrgMember`,
`OrgInfo`, `OrgInvite`, `AddOrgMemberResult`, `AgentAccess`, `AgentAssignment`,
`AgentSettings` (with `allowedModels`), `OrgSettings`, `AuditEntry`, `UsageRow`,
`AgentModelChoice` / `AgentModelChoiceInfo`. `Agent` gains multiplayer-only
`assigned` / `assignedUserIds` / `access` / `assignments`. All hand-maintained
against the gateway (the server is source of truth). Methods in `client.ts`:
`getOrg`, `addOrgMember`, `deleteOrgInvite`, `removeOrgMember`, `setOrgMemberRole`,
`setAgentAssignments` (v2 `{assignments}` or legacy `{userIds}`), `getAgentSettings`
/ `setAgentSettings`, `getOrgSettings` / `setOrgSettings`, `getAgentModelChoice` /
`setAgentModelChoice`, `orgAudit`, `orgUsage`, and
`connectIntegration(provider, toolkit, agent?)`.

---

## i18n

All Teams copy lives in the `teams` namespace
(`app/src/locales/{en,es,pt}/teams.json`, registered in `app/src/lib/i18n.ts`).
Top-level groups: `agentAdmin` (`groups` incl. the inline `general` card, `rows`,
`models` ceiling, inline `values`),
`managedAgent`, `integrations`, `org`, `share`, `people`, `activityTab`,
`usageTab`, `agentsTab`.
(There is also a separate `org` namespace for pre-v2 org strings.) See
`i18n.md`.
