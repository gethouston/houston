# Teams (multiplayer orgs) — the open-repo client surface

The client side of Houston Teams: how the open repo (`app/`, `ui/engine-client`)
renders orgs, roles, per-agent access, sharing, templates, and the org dashboard.

> **The gateway is the sole enforcer.** Every gate in this doc only HIDES an
> affordance the caller can't act on. The private cloud gateway classifies each
> request (use vs configure), clamps access to the org role, and 403s anything
> a role/access level isn't allowed to do — the client NEVER re-clamps and a
> stale/spoofed field can't widen power. Server contracts:
> `cloud/docs/contracts/C3` (roles/assignments, v2 matrix), `C4` (grants +
> effective allowlist), `C7-teams.md` (the v2 layer), `C8-templates.md`.
> Wire surface: `cloud/INTEGRATION.md`.

Everything here is **capability-gated**: absent/single-player hosts (desktop,
self-host, legacy engine) never mount any of it, and the org/template routes
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

Five tabs (`ORG_TAB_IDS`, order fixed in `org-view-model.ts`):
**People / Agents / Templates / Activity / Usage**. `organization-view.tsx` is a
shell — it loads `GET /org` once, builds the shared `OrgViewContext`
(`{org, role, isOwner}`), and each tab owns its own data + UI:

- **People** (`members-tab.tsx`) — roster + pending invites. Owner mutates
  (add/remove/re-role, revoke invite); admin sees it read-only.
- **Agents** (`agents-tab.tsx`) — org agents with assignment counts.
- **Templates** (`templates-tab.tsx`) — the org's reusable agent configs.
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

## Managed-agent read-only surfaces

When the caller is a plain member of a shared agent (`!isAgentManager`), the
configure surfaces render read-only instead of hiding:

- **Agent Settings** (`job-description-tab.tsx`) shows a
  `teams:managedAgent.banner` note; `job-description-access.ts`
  (`isConfigReadOnly`) drives the read-only state off `canEditAgentConfig`.
  `managed-agent-banner.tsx` is the shared banner.
- **Model / effort pickers** (`chat-model-selector.tsx`,
  `chat-effort-selector.tsx`) disable with a `teams:model.lockedTooltip`.
- **Integrations tab** gates its edit affordances on `isAgentManager` /
  `canEditAgentGrants`.

The gateway 403s any configure-scope write regardless — these gates just avoid
showing a dead control.

---

## Agent templates

Reusable agent configs owned by the org (`C8-templates.md`,
`gateway.agent_templates`). A `TemplateSpec` is assembled **client-side** from
what a manager is already viewing — instructions (CLAUDE.md), skills
(`{name, content}`), pinned provider/model/effort, and the allowed-app ceiling —
and stored verbatim by the gateway (which validates shape + size).

- **Save as template** — `save-as-template-section.tsx` (in Agent Settings,
  gated on `isMultiplayer && isAgentManager`) → dialog → `createOrgTemplate`.
- **Create from template** — `use-create-from-template.ts` +
  `create-workspace-dialog.tsx`: `POST /agents` with `templateId`. The gateway
  sets the new agent's allowed apps synchronously and applies the template's
  instructions/skills/model to the pod in the background.
- Types: `TemplateSpec` (full), `TemplateSummary` (list card — derived counts,
  no skill bodies), `TemplateRecord` (one template + `spec`, fetched lazily).
- Client: `listOrgTemplates` / `getOrgTemplate` / `createOrgTemplate` /
  `deleteOrgTemplate` (delete = owner or the admin who created it).

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

## engine-client types + methods

Wire types in `ui/engine-client/src/types.ts`: `OrgRole`, `OrgMember`,
`OrgInfo`, `OrgInvite`, `AddOrgMemberResult`, `AgentAccess`, `AgentAssignment`,
`AgentSettings`, `OrgSettings`, `AuditEntry`, `UsageRow`, `TemplateSpec` /
`TemplateSummary` / `TemplateRecord`. `Agent` gains multiplayer-only
`assigned` / `assignedUserIds` / `access` / `assignments`; `CreateAgent` gains
`templateId`. All hand-maintained against the gateway (the server is source of
truth). Methods in `client.ts`: `getOrg`, `addOrgMember`, `deleteOrgInvite`,
`removeOrgMember`, `setOrgMemberRole`, `setAgentAssignments` (v2 `{assignments}`
or legacy `{userIds}`), `getAgentSettings` / `setAgentSettings`, `getOrgSettings`
/ `setOrgSettings`, `orgAudit`, `orgUsage`, `list/get/create/deleteOrgTemplate`,
and `connectIntegration(provider, toolkit, agent?)`.

---

## i18n

All Teams copy lives in the `teams` namespace
(`app/src/locales/{en,es,pt}/teams.json`, registered in `app/src/lib/i18n.ts`).
Top-level groups: `managedAgent`, `model`, `integrations`, `org`, `share`,
`people`, `activityTab`, `usageTab`, `agentsTab`, `templates`, `templatesTab`.
(There is also a separate `org` namespace for pre-v2 org strings.) See
`i18n.md`.
