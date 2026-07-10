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
- `canSeeIntegrationsPage(caps)` — the global Integrations page gate (sidebar nav,
  render branch, tour step): a Teams **plain member** → false, else true
  (owner/admin delegate to `canSeeMembers`; non-Teams and single-player → true). A
  member's account home is instead Settings > Connected accounts.
- `canSeeAiModelsPage(caps)` — the SAME gate for the global **AI Models hub**
  (sidebar nav, render branch, tour step): a Teams **plain member** → false, else
  true. Unlike Composio, AI provider connections are **org-level** (one credential
  per org — whoever connects, every member's agents work; `cloud/docs/contracts/C6`),
  so a member has no per-provider account to house anywhere — they pick their model
  per agent in the composer. The hub is therefore owner/admin-only in Teams and gains
  the org model-policy tab; a member loses its nav entirely (mirrors the Integrations
  gate). This also removes a dead affordance — a member's provider-connect POST
  already 403s at the gateway.
- `canEditOrgSettings(caps)` — **owner only**; gates BOTH org policy editors — the
  app allowlist on the Integrations page AND the model ceiling on the AI Models hub
  (admins see them read-only). See the allowlist + models ceilings below.
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

Sharing a **personal** agent has no members to assign, so that path opens the
**share-via-team** pipeline instead (see **Spaces > Share-via-team pipeline**).

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

**Both model ceilings have a frontend home** (mirroring the app-allowlist pair) —
the shared presentational `ModelsAllowlistEditor`
(`app/src/components/ai-hub/models-allowlist-editor.tsx`, the model-side twin of
`AllowlistEditor`, extracted from the old inline `AgentModelsSection`): an
always-visible `AccessChoice` over the AI-hub catalog's `ModelAllowRow`s, `readOnly`
hides the "Add models" list, all copy passed in.

- **Org ceiling** — the **AI Models hub's "Workspace policy" tab**
  (`ai-hub/ai-hub-policy.tsx`, a third `AiHubTab` shown when `multiplayer && teams`;
  the hub itself is owner/admin-only in Teams, see `canSeeAiModelsPage`). Owner-editable,
  admin READ-ONLY (`canEditOrgSettings` = owner only). Wire: `OrgSettings.allowedModels`;
  client `getOrgSettings` / `setOrgSettings` (now a **partial patch** — `{allowedToolkits?,
  allowedModels?}`, matching the gateway). Hook `useSetOrgAllowedModels`
  (`hooks/queries/use-org-settings.ts`) — optimistic on `["org-settings"]`, invalidates
  `["agent-settings"]` (an org models change narrows every agent's selectable universe).
  Copy under `teams:models.orgAllowlist.*` + `aiHub:tabs.policy`.
- **Per-agent ceiling** — Agent Settings > **Access** > **AI models**
  (`agent-admin-model.tsx` → `AgentModelsSection`, now a thin wrapper over the shared
  editor). It **narrows the selectable universe to the org ceiling** via
  `AgentSettings.orgAllowedModels` (a model is offerable only when an offer is org-allowed,
  the exact `orgAllowedToolkits` treatment the app allowlist uses), so an org-disallowed
  model is never offered for an agent. Copy under `teams:agentAdmin.models.*`.

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
- Types: `AgentSettings.allowedModels` + `AgentSettings.orgAllowedModels?` (the org
  ceiling the agent set is intersected with), `OrgSettings.allowedModels?` (the org
  ceiling itself; both optional so pre-ceiling hosts read as `undefined` = null),
  `AgentModelChoice` (`{provider, model, effort?}`),
  `AgentModelChoiceInfo` (`{choice, allowedModels}`).
- Client: `getAgentModelChoice` (404-degrades to `null` off-Teams) / `setAgentModelChoice`
  (`GET`/`PUT /agents/:slug/model-choice`); `setAgentSettings` widened to
  `{allowedToolkits?, allowedModels?}`. Hooks: `useAgentModelChoice` /
  `useSetAgentModelChoice` (`hooks/queries/use-agent-model-choice.ts`),
  `useSetAgentAllowedModels` (`hooks/queries/use-agent-settings.ts`).

---

## Invites, members, audit, usage

- **Invites**: `addOrgMember(email, role)` → `POST /org/members` (targets the
  ACTIVE space; `403 personal_space` on a personal one). A known user is added
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

Members can only connect apps the org + agent allow. See `integrations.md` §2
for the full model. In short: `effective = orgCeiling ∩ agentCeiling`
(`null` = all, `[]` = none), grants are pruned when a ceiling shrinks, and a
per-agent connect carries the agent slug so the gateway checks the allowlist and
auto-grants on success.

**Both ceilings now have a frontend home** — the shared presentational
`AllowlistEditor` (`app/src/components/integrations/allowlist-editor.tsx`), fed
different copy per ceiling:

- **Org ceiling** — the global **Integrations page** in Teams mode
  (`integrations-view/integrations-policy.tsx`, reached when
  `integrationsPageMode(caps) === "policy"`, i.e. `multiplayer && teams`).
  Owner-editable, admin READ-ONLY (`canEditOrgSettings` = owner only; the
  `teams:integrations.orgAllowlist.ownerOnly` note explains why). Client:
  `getOrgSettings` / `setOrgSettings`, consumed by `useOrgSettings` /
  `useSetOrgSettings` (`app/src/hooks/queries/use-org-settings.ts`, query key
  `["org-settings"]`). Copy under `teams:integrations.orgAllowlist.*` (+
  `integrations:policyPage.*`).
- **Per-agent ceiling** — Agent Settings > **Access** > **Apps**
  (`AgentAllowlistSection`, manager-only). Client: `getAgentSettings` /
  `setAgentSettings`. Copy under `teams:integrations.allowlist.*`.

`teams:integrations.orgAllowlist.*` and `teams:integrations.allowlist.*` carry the
same choice keys (`question` / `anyLabel` / `pickedLabel` / …); `orgAllowlist` adds
`ownerOnly`. Per-agent GRANT toggles are a separate concept and live only in
Settings > Connected accounts (the members' account home), never in either ceiling
editor.

**Blocked apps stay VISIBLE (never silently absent).** The agent Integrations
tab shows a ceiling-blocked app in one of two places rather than hiding it: a
CONNECTED blocked app appears in the disallowed section (`teams:integrations.notAllowed`,
"Not allowed" badge + an ask-your-admin line), and a NOT-connected blocked app
appears as a **locked row** in the browse catalog (lock icon + `integrations:locked.askAdmin`
"Ask your admin to enable {app}", capped preview; see `integrations.md` §3
"Locked browse rows"). The ceiling editor (`AgentAllowlistSection`) reads as admin
POLICY via `teams:integrations.allowlist.policyHelper`. Member connect surfaces
stay account-connection language ("connected to your account"), never "allowed".
The pure split is `browseCatalogView` (`integrations/model.ts`); off Teams
(`allowlist === null`) nothing is ever locked.

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
`AgentSettings` (with `allowedModels` + `orgAllowedModels`), `OrgSettings` (with
`allowedModels`; `setOrgSettings` is a partial patch), `AuditEntry`, `UsageRow`,
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
per-agent `models` ceiling, inline `values`),
`managedAgent`, `integrations`, `models` (the root `models.orgAllowlist.*` org model
ceiling, sibling of `integrations.orgAllowlist`), `org`, `share`, `people`,
`activityTab`, `usageTab`, `agentsTab`. (The AI Models hub's own strings, incl.
`tabs.policy`, live in the separate `aiHub` namespace.)
(There is also a separate `org` namespace for pre-v2 org strings.) See
`i18n.md`.
