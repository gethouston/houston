# Teams UI — the sidebar teams and the `team` screen

**This is the whole shell.** Every screen is a top-level view. A team's screen is for
WORKING (Tasks | Routines | Files); clicking an agent row opens the agent's OWN screen,
the same three sections scoped to that agent. CONFIGURATION lives behind drilled,
manager-only doors: Team Settings on the team screen, Agent settings on the agent screen.

**Not `teams.md`.** That doc is MULTIPLAYER orgs — roles, spaces, seats, sharing, all
gateway-enforced. This is the **client-side team surface**: how the sidebar groups agents
into teams and what the `team` screen behind each row does. It exists single-player too,
where the solo user is every team's owner.

> **Vocabulary trap.** C8 calls an org a "team space", and the `spaces` / `teams`
> capability flags plus `POST /v1/orgs` all mean THAT. The teams in this document are a
> second, finer grouping INSIDE one space. Confusing the two is how someone ends up
> gating agent access on a team.

The wire contract of record is `cloud/docs/contracts/C13-agent-teams.md` (routes, error
codes, server-side effective-value rules). This doc is the CLIENT half; when they
disagree, C13 is right.

| Related | Topic |
| --- | --- |
| `sidebar-anatomy.md` | The rail's row component, geometry invariants, disclosure + motion |
| `board-shell.md` | Kept-alive screens, keyboard ownership, the ONE shared panel, published nav targets |
| `agent-manifest.md` → *Sidebar structure* | Rail structure, drag-and-drop, i18n keys, the `ui/layout` props |
| `agent-settings.md` | The per-agent page the Settings section drills into |

## Navigation: "agent X's `<thing>`" → a team view

Two modules own the one translation, so a notification, a @mention row, the command
palette and a turn summary can never land three different places.

| Module | Half |
| --- | --- |
| `app/src/lib/agent-nav.ts` | The PURE rules — `AgentNavTarget` (`board` / `routines` / `files` / `settings`), `agentDestination(teams, agentId, target)` → `{view:"team", teamId, section, agentFilter}` (or `{view:"none"}` for an agent no team claims, which the caller answers — a board request goes HOME, a settings request refuses out loud), and `canOpenAgentSettings(caps, agent)` = `isAgentManager` (agent settings are manager-only). Tests: `app/tests/agent-nav.test.ts` |
| `app/src/lib/open-agent.ts` | The IMPERATIVE half — `openAgentBoard`, `openAgentSection("routines"\|"files")`, `openAgentSettings(agentId, section?)`. Settings is the one target that toasts rather than falling back, and it clears any armed one-shot first so a failed nav cannot fire later |

The destination MAP itself is `agent-manifest.md` → *Where an agent's surfaces live*;
`packages/web/e2e/teams-nav.spec.ts` drives it end to end.

## Two backends, one seam

`capabilities.agentTeams` is a **feature-detect**, not a feature flag: the gateway
describing whether it serves C13 teams.

- **OFF** (desktop, self-host, every pre-C13 gateway) — a team is a **named home for
  agents** drawn from the workspace's stored `sidebar_layout`: a named team IS a stored
  `SidebarGroup`; the **default team is the workspace itself**, wearing the workspace's
  name and holding every agent in no group. The default team is **virtual** — nothing is
  written to `sidebar_layout` to make it exist, so there is no stored-layout migration and
  no new wire shape. It renders when empty; locally it cannot be renamed or deleted (it IS
  the workspace). Every agent belongs to exactly ONE team; there is no "loose
  agents" remainder.
- **ON** — teams and their rosters are the SERVER's (`GET /v1/org/teams`). Everything above
  holds unchanged; the off-capability path is **byte-identical**, and every rule below is
  written so its off-capability branch is literally the code that shipped before C13.
- **`useTeams()`** (`app/src/hooks/use-teams.ts`) is THE seam — the one place the branch is
  taken and the one resolution path the sidebar, the team view and the workspace shell's
  guard all read, so the rail can never disagree with the screen it navigates to. It
  composes the capability, the server's teams, the agent store, the cached sidebar layout
  and the workspace name, memoized because consumers derive memoized structures from it.
  Off-capability with no workspace it returns `[]`; server-backed with the first read in
  flight it also returns `[]`.
- The capability is read through ONE predicate, `hasAgentTeams(caps)` (`lib/org-roles.ts`).
  The branch is the pure `resolveTeamsForBackend` in `lib/teams-backend.ts` — not in the
  hook module, because `lib/open-agent.ts` needs it and a lib reaching into `hooks/` for a
  pure function is the wrong direction. Its store-free twin `currentTeams()`
  (`lib/current-teams.ts`, its own module because BOTH imperative navigators need it —
  `open-agent.ts` and `home-nav.ts` — and one importing the other would close a cycle) reads the same
  two caches (`getCurrentAgentTeams()` and
  `queryClient.getQueryData(queryKeys.capabilities())`). Two copies of that rule would let
  the rail and a keyboard shortcut resolve different teams for the same agent.

### The seven merge rules (`app/src/lib/server-teams-model.ts`, pure)

`resolveServerTeams(serverTeams, agents, layout, defaultSeedName)` merges the server's
teams, the local agent store and the ordering overlay into the `TeamView[]` everything
renders. `defaultSeedName` is the name the gateway minted the default team with (the org
name in a team space, `personalDefaultTeamSeed` in a personal one); a default team still
wearing it is marked `usesDefaultIdentity` for the "New Team" placeholder.

1. **Server order wins.** The gateway already sorts by `(sortOrder, createdAt, id)`. The
   overlay never reorders TEAMS, only agents inside one.
2. **Membership is the server's.** `agentSlugs` is matched against the agent store by
   `Agent.id` — on the gateway an agent's id IS its slug. A slug with no agent row is
   DROPPED silently (inventing a row would put a nameless entry in the rail); a slug
   repeated inside one team renders once.
3. **Order inside a team is the overlay's.** The overlay group whose `id` equals the team
   id supplies `agentIds`: members it names come first in that order, then the rest in
   server `agentSlugs` order. Overlay ids this team does not hold are ignored, not an
   error — that is just a stale drag order after someone else moved the agent.
4. **Leftovers land in the default team**, in agent-store order. The roster read and the
   teams read are two separate requests, so a just-created agent is in one before the
   other and the rail must never lose an agent. With no default team in the response,
   leftovers are dropped — the client never invents a team.
5. **Server facts are copied verbatim.** `{joined, owner, memberCount, sortOrder}` land on
   `TeamView.server` exactly as sent — they are the caller's EFFECTIVE values, already
   resolved server-side. Re-deriving any of them gets them wrong: an org owner/admin reads
   `owner: true` on every team, everyone reads `joined: true` on the default one, and the
   default team's `memberCount` is the whole space's rather than a row count.
6. **There is no joined/other split.** The gateway serves a caller only the teams they
   are part of, so the client has nothing to partition.
7. **The overlay is ADJUSTED on write, never pruned.** `normalizeTeamOverlay(layout,
   serverTeams)` (`lib/team-overlay.ts`, which owns both halves of the overlay) may only touch rows naming a LIVE server team, where it narrows
   `agentIds` to the agents that team actually holds (a stale drag order decays on the next
   write instead of accumulating) and fills a BLANK name from the server's own (a row
   upserted by a first collapse or first drop is born nameless via `blankOverlayGroup`).
   Every OTHER stored group is carried through untouched, in place. Deleting them fires on
   a FRESH personal space (one default team, no created ones) — every local group the user
   ever built is "not live" there, and one drag used to persist their names, shared context
   and membership away for good. The price is an inert invisible row for a team someone else deleted,
   which cannot cost anyone their work. Normalizing on write rather than on read is
   deliberate: a read-side pass would touch the user's drag order during any window where
   the teams read is empty or in flight.

### The overlay

Server-backed, the stored `sidebar_layout` stops being the model and degrades to a
per-user **ORDERING OVERLAY** keyed by SERVER team id.

- Only `id`, `collapsed` and `agentIds` are ever read there. **`name` and `context` are
  inert** — the server names its teams, and nothing reads a group's shared context on a
  server host, which is why the Context pane reads the SERVER's own context column there
  (`teamContextSource`) rather than the stored group's.
- `normalizeTeamOverlay` leaves `context` and `collapsed` exactly as they were and only
  ever WRITES a `name` into a row that has none (rule 7).

### The honest empty state

Server-backed with the first read in flight, `resolveTeamsForBackend` resolves to **no
teams** — deliberately NOT a fallback to the local groups, which describe a grouping this
host does not have and would rearrange one refresh later. TanStack keeps the last good
data across refetches and errors, so this is first-load only, and it is exactly what
`blockedTeamView` reads. Nothing in the read path degrades a 404 either (`ui/engine-client`'s
C13 block and the adapter mixin both throw): the caller feature-detected first, so a 404
can only mean the host advertised the surface and then denied it.

### The one user-visible consequence

On a gateway that advertises `agentTeams`, a personal space GROUPS AGENTS like any team
space — create/rename/delete/move all work; only the three people routes refuse
(`403 personal_space`: join, member add/remove/owner — the "work with people" path is
creating an organization). The client hides the people affordances there
(`isPersonalSpace(caps, activeSpaceIsTeam)` in `lib/org-roles.ts` → no Members card, no
Leave; `partitionTeams` folds everything into `joined`). A user who
had built LOCAL sidebar groups before the capability sees them **stop grouping** on a
FRESH personal space — the overlay preserves agent ORDER, not grouping, until they recreate
teams server-side. The old groups are not destroyed: names, shared context and membership
sit intact in the overlay and come back if the capability ever goes away. Pinned by
`server-teams-model.test.ts` ("a FRESH personal space does not erase the user's local
groups", plus the collapse-toggle and group-reorder writes that used to erase them).

### Writes: the expected-error taxonomy

- Six gateway rejections are **business states, not Houston bugs**: `default_team`,
  `personal_space`, `not_team_owner`, `invalid_team_id`, `not_a_member`, `invalid_name`.
  Everything else it can answer (`team_not_found`, `invalid_sort_order`, `invalid_owner`)
  means the client sent something it should never have sent, so it must reach us as a bug
  report.
- `invalid_name` is the only refusal a user can provoke by TYPING, so the real fix is the
  ceiling: `TEAM_NAME_MAX_RUNES = 60` (`team-members-model.ts`) mirrors the gateway's
  `1..60 RUNES after trimming`, counted the same way (`[...name].length`; a `maxLength`
  attribute counts UTF-16 units and would cut `"🙂".repeat(60)` — a name the gateway
  ACCEPTS — in half). `clampToRunes` caps the Team Settings field and, through
  `AppSidebar`'s `groupNameMaxRunes`, the rail's inline rename and the create draft that
  commits through it; paste is clamped, never blocked.
- `app/src/lib/agent-team-errors.ts` is the pure classifier: `agentTeamErrorCode` (reusing
  `shareErrorCode`, which reads the FLAT `{error, code}` shape the Go edge answers with),
  `isExpectedAgentTeamError`, and `agentTeamErrorCopy`, which returns i18n KEYS so the copy
  map unit-tests without a DOM.
- `app/src/hooks/queries/agent-team-write.ts` is the ONE surface: every agent-teams
  mutation passes the shared `SILENCE_EXPECTED` constant into its `tauriAgentTeams.*` call
  and carries `surfaceExpectedAgentTeamError` as its `onError`. Expected becomes an
  informational toast in the user's own words; unexpected falls through to `call()`'s red
  report-a-bug pair. One constant, one function, one module, so no mutation can end up
  wired half-way.
- **Deliberately NOT a branch in `surfaceError` (`lib/tauri.ts`)**: `personal_space` already
  means something else there (the invite flow), and the error alone cannot tell the two
  apart — only the call site can.

### Reactivity

- **Every team mutation fans out the same `AgentsChanged` event the client already reacts
  to** — created, renamed, deleted, joined, left, agent moved. No team write needs a
  refresh signal of its own.
- `app/src/lib/agent-invalidation-plan.ts`'s `AgentsChanged` case pushes
  `queryKeys.agentTeams()` and the whole `["agent-team-members"]` PREFIX (the event names
  no team), inside the SAME `workspaceId` guard the roster reload uses: on an `agentTeams`
  host the teams ARE this workspace's grouping, and another workspace's event must not
  disturb it. Without it the roster reloads and the rail keeps the previous grouping until
  the next mount.
- Reads: `app/src/hooks/queries/use-agent-teams.ts` — `agentTeamsQueryOptions` (key
  `agentTeams()`, `staleTime` 30s), `useAgentTeams(enabled)` where `enabled` IS the
  capability, `useAgentTeamMembers(teamId, enabled)`, `getCurrentAgentTeams()` for the
  store-free reader, and every write hook. `useMoveAgentToTeam` is the one OPTIMISTIC
  write: cancel the teams query, snapshot, apply the pure `moveAgentInTeams` patch, restore
  on refusal — the drop already animated the agent into its new block, so the cache must
  agree before the round trip.

## The model — `app/src/lib/teams-model.ts`

| Export | What it is |
| --- | --- |
| `TEAM_VIEW_ID = "team"` | The one `viewMode` every team shares |
| `homeTeam(teams)` | HOME: the FIRST team in rail order, whose Mission Control the app opens on and where every fallback lands. `null` while no team has resolved, which the callers answer with the Inbox. Imperative half: `openHome()` in `lib/home-nav.ts` |
| `DEFAULT_TEAM_ID = "team:default"` | Id of the virtual default team, LOCAL backend only. Server-backed the default team wears a real server id, so nothing may assume this sentinel when resolving a drop target |
| `TeamSectionId` | `"mission-control" \| "routines" \| "files" \| "settings" \| "context" \| "agents" \| "people"` — the last three exist only on the drilled Team Settings level |
| `TeamView` | `{ id, name, agents, isDefault, server? }` — one team, members in drag order |
| `ServerTeamFacts` | `{ joined, owner, memberCount, sortOrder }`, copied verbatim off the wire. Present ONLY on an `agentTeams` host: its **absence** is what keeps every rule byte-identical locally, so "is this team server-owned?" is asked everywhere as `team.server !== undefined` |
| `resolveTeams(agents, layout, workspaceName)` | The LOCAL backend: named teams in display order, then the default team. Built on `resolveSidebarSections` (`lib/agent-order.ts`), so membership and rail order are one resolution |
| `teamById` / `teamOfAgent` | Lookups (`teamById` takes `string \| null`) |
| `visibleTeamSectionsForTeam(caps, team)` | **The ONE section list** for the team's base level, read by both the rail's rows and the view FOR THE SAME TEAM. See below |
| `visibleTeamSettingsSections(caps, team, peopleFace)` | The drilled Team Settings lozenges (`context`/`agents`/`people`/`settings`). `[]` is the REFUSAL for a caller who cannot configure the team; `people` is omitted on a `"hidden"` face |
| `visibleAgentSections(caps, agent)` | The agent screen's lozenges: the three work sections `+ "settings"` for the agent's managers |
| `teamPeopleFace(team, personalSpace, spacesHost)` | `"roster"` \| `"invite"` (personal space: the create-organization face) \| `"hidden"` (no organizations in this deployment) |
| `teamDisplayName/Icon/Color` | `lib/team-display.ts` — the untouched-default placeholder rules ("New Team", rocket, charcoal), shared by the rail, the picker seed and everything else that draws a team |
| `teamDeletePresentation(teams, team)` | `"enabled"` \| `"hidden"` \| `"disabled-only-team"` (Delete stays visible with a reason on the only team) |
| `resolveTeamSection(sections, requested)` | What ACTUALLY renders: the requested section when visible, else `sections[0]`. One rule absorbs every stale-store case |
| `sectionHonorsAgentPin(section)` | Whether the OPEN section narrows by `teamAgentFilter`. True for Mission Control / Routines / Files, false for Settings, which lists the whole team |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves — and ONLY that. Mirrors `blockedTopLevelView`. It deliberately does NOT ask whether the caller joined |
| `canRenameTeam` / `canDeleteTeam` / `canLeaveTeam` / `canJoinTeam` | `lib/team-permissions.ts`, re-exported here. Each answers twice, once per backend. See below |
| `resolveServerTeams` (`lib/server-teams-model.ts`) + `normalizeTeamOverlay` (`lib/team-overlay.ts`) | The SERVER backend |

**`visibleTeamSectionsForTeam`** yields `["mission-control","routines","files"]` for
everyone, `+ "settings"` (the Team Settings door) when `canConfigureTeam(caps, team)` =
`(team.server ? team.server.owner : canConfigureTeamsByRole(caps)) || team.agents.some(a => isAgentManager(caps, a))`
(`lib/team-permissions.ts`).

- On a server-teams host the server's own `owner` for THAT team replaces the
  client-derived org-role half: it already folds in the org owner/admin (implicit owner of
  every team) and adds the EXPLICIT team owner, who configures their team without being an
  org admin. The agent-manager clause is untouched on both backends.
- Only Settings is gated: the other three show the team's WORK, and a member who may use
  the team's agents may see what they do and what they keep. It is **per team**, not per
  caller — the same person configures one team and only uses the next, so the rail asks
  again for every block it draws.

**Team-action gates** — affordance gates ONLY; the gateway is the sole enforcer and every
refusal is also an expected state. All of them surface in Team Settings → Settings; the
rail rows carry no actions. Rename: locally any named group (never the virtual default,
which displays "New Team" until a server host renames it);
server-side the team OWNER, and the default team IS renamable there through
Change icon & name. Delete: never the default on either backend, plus owner-only server-side.
Leave: server-only, `canLeaveTeam(team, personalSpace)` = `server.joined && !isDefault
&& !personalSpace` (a personal space's creator row is unremovable — Leave never shows
there). There is no Join: a member is shown only the teams they are already in.

## Store contract (`app/src/stores/ui.ts`)

- **Five FLAT team fields**, no nested object: `activeTeamId: string | null`,
  `teamSection: TeamSectionId | null`, `teamAgentFilter: string | null` (the **agent ID**
  every section narrows to; `null` = the whole team), and two mutually exclusive focus
  flags — `teamAgentFocus: boolean` (the agent's OWN screen, filtered to
  `teamAgentFilter`) and `teamSettingsFocus: boolean` (the drilled Team Settings level).
- **One writer sets them all at once** — `openTeamView(teamId, section, { agentFilter?,
  agentFocus?, teamSettingsFocus? })`; omitted flags CLEAR, so a plain call is always the
  team's base level,
  which also sets `viewMode: TEAM_VIEW_ID`, so the view is never half-set. Omitting
  `agentFilter` **clears** it (the rail passes the live pin through instead);
  `setTeamAgentFilter(agentId | null)` is a section dropdown writing back. The initial
  `viewMode` is `INBOX_VIEW_ID` — the one screen that needs no team, so the first paint is
  honest while the teams are still resolving; the guard's BOOT rule moves the user to the
  first team's Mission Control the moment one lands.
- **`partialize` persists exactly FIVE keys**: `sidebarCollapsed`, the three rail band
  folds (`teamsSectionCollapsed`, `myAccountsSectionCollapsed`,
  `workspaceSectionCollapsed`) and `filesViewMode`. `reset()` keeps the same five — they are
  per-MACHINE layout prefs, not identity-scoped. Pinned by `app/tests/ui-store-reset.test.ts`
  ("keeps the per-machine layout preferences"). None of
  the four team fields is persisted, so "stale" means within a session, typically a space
  switch changing the caller's role.
- **There is no highlight state in the store.** Which rail row is lit is DERIVED, purely,
  in `lib/sidebar-teams.ts` — a stored highlight would be a second source of truth.
- One more team-shaped field: `pendingRoutineChat: {agentId, activityId} | null`, the
  one-shot nav target for a routine chat with no board card (a session-finished
  notification click). The owning agent travels WITH the id because the Routines section
  is cross-agent and would otherwise have to guess whose chat the id belongs to.

## The `team` top-level view

- `TEAM_VIEW_ID` is registered in `lib/top-level-views.ts` and mounted by
  `topLevelScreenViews` — **one** kept-alive screen for every team, so renaming, reordering
  or deleting a team can never orphan a view id.
- `TeamView` (`team-view.tsx`) reads `useTeams()` + `activeTeamId` + `teamSection`, resolves
  the section, and keys its child on the team id so switching teams starts clean.
- **Two guards, no third**: `resolveTeamSection` (never a blank pane), inside `TeamView`;
  and `blockedTeamView`, in `shell/use-workspace-view-guards.ts` (a dead team id sends the
  user HOME; `TeamView` renders `null` for that frame). A team the caller has not JOINED is
  not blocked — it renders.
- `useWorkspaceViewGuards(showAiModels)` is the shell's standing-rules module, called once
  from `workspace-shell.tsx`, holding FOUR effects. The two DECISIONS behind the first two
  are pure functions in `shell/view-guard-rules.ts` (`bootGuardStep`, `deadViewStep`), pinned
  by `app/tests/view-guard-rules.test.ts`; the hook is only the effect around them.
  (1) **Boot lands on the first team's Mission Control** — the store starts on the Inbox and
  the moment `homeTeam(teams)` resolves the user moves to its board. One shot per workspace,
  re-armed on a workspace change (each space boots into its own first team) and DISARMED if
  the user navigated somewhere of their own during the read. The boot state is two fields
  (`workspaceId`, `armed`) rather than one ref, because a single ref disarms on the
  space-switch tick and would break `create-team-dialog`'s `openHome()` → boot composition.
  (2) **The open view must exist** — `!isTopLevelView(viewMode)`, `blockedTopLevelView` (a
  role-hidden screen such as the AI Models hub) or `blockedTeamView` all go home. The ONE
  carve-out: a dead TEAM view with `teams.length === 0` WAITS, because the server-teams read
  answers `[]` on its first pass and "your team is gone" is indistinguishable from "the teams
  have not arrived". A `viewMode` that is not a top-level view at all carries no such
  ambiguity and goes home even with no teams, which there means the Inbox.
  (3) **something is always current** — `currentAgent` picks no SCREEN any more, but provider
  routing, model prefs and the palette still read it, so the first agent adopts it when
  nothing has;
  (4) **one `tab_opened` point** — watching `viewMode` catches rail click, shortcut and
  programmatic redirect alike, fires on real transitions only, and skips `settings`, which
  emits its own (vocabulary: `production-infra.md`).

Keyboard ownership, the shared panel, and where a published mission-nav lands →
**`board-shell.md`**.

### Guide me

- "Guide me" (the sidebar footer's help control) replays the in-app setup
  (`onboarding/in-app-onboarding.tsx`). The `data-tour-target` anchors survive as the
  shell's landmark vocabulary (`workspace-tour-steps.ts`); tutorial-only anchors live
  in `onboarding/tutorial-targets.ts`.


## Sections

- **Tasks** (`team-mission-control.tsx`; the code id stays `mission-control`, the label users
  read is "Tasks") — the team's active board, its archive,
  or `TeamMissionEmpty`. The three SWAP, so only the
  on-screen surface runs hooks and claims the panel. It owns the full roster + the shared
  scope for both boards (*The one-sweep rule*).
- **Routines** (`team-view/team-routines/`) — ONE list of every team agent's routines, each
  row naming its owner. Aggregating is honest: a routine is a flat row. Routines still
  being BUILT in chat are rows too (`team-routine-drafts-model.ts` +
  `use-team-routine-drafts.ts`): a draft is an unclaimed setup ACTIVITY, invisible to any
  routines read, and without those rows a routine half-started here vanishes the moment its
  chat closes, under a grid still claiming nothing runs on its own. Drafts resume and
  discard from the row, wear the owner chip, and light while their chat is open.

  Directory by job: **frame** — `team-routines.tsx` (the list left, the selected routine's
  chat in the shared shell panel right), `team-routines-header.tsx`,
  `team-routines-footer.tsx` (the timezone every schedule is read and written in),
  `team-routine-owner-chip.tsx` (dropped once the list narrows to one agent). **Reads** —
  `use-team-routines-data.ts`, `use-team-routine-drafts.ts`, `use-team-trigger-statuses.ts`.
  **Writes + chat** — `use-team-routine-actions.ts`, `use-team-routine-host.tsx` +
  `team-routine-panel.tsx`, `use-pending-team-routine-chat.ts`, `use-team-grid-labels.ts`.
- **Files** (`team-view/team-files/`) — the opposite call: folders nest, so merging trees
  would invent a filesystem nobody has, with no honest answer to where an upload lands. It
  picks ONE agent and mounts `AgentFilesSurface` (`components/agent/agent-files/`), keyed on
  the agent, so the browser, every action and the failure strip are one implementation
  (`files-ui.md`). This is the ONLY mount of that surface.
- **Team Settings** — a manager-only DOOR, not a tab of work: it swaps the header to a
  drilled level (back chip = the team's glyph + name) with its own lozenges
  Context | Agents | People | Settings (`visibleTeamSettingsSections`; People is omitted
  where the deployment has no organizations). First screen is for working, the drilled
  level is for settings.
- **Agent rows open the agent's OWN screen** (`agentFocus`): Tasks | Routines | Files
  scoped to that one agent, plus an Agent settings door for its managers
  (`visibleAgentSections`). The drilled agent page (`permissions/agent-detail.tsx`) wears
  a back chip with the agent's avatar + name and returns to the agent's board.

Every section's empty-team state goes through `TeamEmpty` (`team-empty.tsx`): the default
team offers "create your first agent", a named team says to drag one in (a new agent would
land in the default team). Only the promise changes per section ("its missions" / "its
routines" / "the files it keeps").

### The drilled Team Settings level

- **Panes** (`team-view/team-settings-pane.tsx` under `TeamSettingsHeader`): **Context** —
  the team's shared prose on the standing-context page (`ContextEditorPage`). **Agents**
  (`team-agents-list.tsx`) — an accordion per agent (group title outside the card, the
  sidebar's triangle beside the name, first one open), each holding `SettingsRow`s for the
  agent's sections with gateway-cheap policy values on the trailing edge (People
  everyone/count, Integrations/AI Models all/count; a failed read renders "Couldn't load",
  never a pending look — `agent-policy-chips-model.ts` + `agent-policy-values.ts`; NO
  pod-owned facts in the fan-out). Clicking a row opens that agent's drilled settings page
  on that section. **People** — the roster/members card where the deployment has
  organizations, the create-organization invite face in a personal space
  (`teamPeopleFace`: `roster` / `invite` / `hidden`). **Settings**
  (`team-settings-actions.tsx`) — Change icon & name (the identity dialog), Move to an
  organization (personal spaces), Leave, Delete; Delete renders visible-but-disabled with a
  reason when it is the only team (`teamDeletePresentation`).
- **Refusal is the empty list**: `visibleTeamSettingsSections` answers `[]` for a caller
  who cannot configure the team (`canConfigureTeam`), and the view kicks a refused focus
  back to the team's board — authority can be lost while the view is open.
- **Identity** (`shell/edit-team-identity-dialog.tsx` + `team-identity-popover.tsx`): name,
  mark and colour staged in ONE dialog, saved as a diff against what was shown. The picker
  offers the 233 generated 16px glyphs (`ui/layout` `sidebar-group-glyph-data*`;
  `pnpm generate:team-icons` regenerates from `ui/layout/icons/team-icons.svg`, sanitizer
  rejects non-drawing SVG) over the agent colour palette, with search that matches
  localized labels and a translated concept vocabulary, accent-insensitively
  (`matchesSidebarGroupGlyph`). The dialog seeds from the DISPLAY identity
  (`teamDisplayIcon`/`teamDisplayColor`, `lib/team-display.ts`), so an untouched default
  team opens showing exactly the "New Team" + charcoal rocket the rail draws.
- **An untouched default team displays localized "New Team" + the charcoal rocket in every
  space; a renamed one keeps its real name.** Display-only, nothing is written
  (`usesDefaultIdentity`). "Untouched" = the stored name still equals the name the gateway
  minted: the org name in a team space, the caller's email local-part in a personal one
  (`personalDefaultTeamSeed`, byte-compatible with the gateway's mint).
- **Move team to an organization** (personal → org, the funnel): a state machine in
  `lib/move-team.ts` (pick → confirm → movingAgents → cleanupSource → switching → recreate
  → placing → invite), sequential per-agent moves over the shipped C8 move wire, then C13
  recreation in the target. Durable record `houston.pendingTeamMoves`
  (`lib/pending-team-move.ts`) carries `movedAgentIds` + `postscriptStage` checkpoints; the
  post-move pipeline runs in ONE module-level driver shared by the dialog and the boot
  healer (`hooks/use-team-move-resume.ts`), so it survives the dialog unmounting on the
  space switch, resumes mid-stage on retry, and reconciles the recreated team by persisted
  id before name. Failure copy reports real progress ("2 of 5 agents moved"). The driver's
  toasts yield to the dialog's inline faces while it is mounted.

## The one-sweep rule

**No team surface may start a cross-agent read that duplicates an existing one.**

**Mission Control.** Both of a team's boards — the ACTIVE one (`TeamMissionBoard` →
`useMissionControlSource`) and the ARCHIVE (`MissionControlArchived` →
`useMissionControlArchived`) — are handed the **full workspace roster** plus a
`MissionControlScope` (`components/board/use-mc-scope.ts`: `scopePaths`, `title`, `teamId`,
`filterPath`, `onFilterPathChange`). `team-mission-control.tsx` is the ONE owner of both:
it reads the roster from the agent store, builds the scope with `useTeamBoardScope(team)`
(before the empty-team early return — hooks may not run conditionally), and hands the same
two values to whichever surface is up. `scopePaths === undefined` → the global board; an
array, empty included, → one team. The scope only narrows what the board RENDERS, through
the one narrowing path `useMcScope(agents, items, scope)`.

Handing a surface only the team's agents mints a SECOND `all-conversations` key, and three
defects follow: a second cross-agent fan-out per team (a pod-wake storm on cold agents);
`retargetSweepRecovery(roster)` seeing a different roster string and cancelling the pending
global re-sweep (breaking HOU-981's recovery); and `latestCachedAllConversations` picking the
newest successful variant of the prefix, so a team's NARROW result seeds the global board as
placeholder data. The archive shipped with exactly this bug. The scope also carries `title`
(which `MissionControlToolbar` composes with the mode — `"{{name}} · Archived"`) and `teamId`
(today only `missionControlDraftScope`, which yields the bare `"mission-control"` globally so
stored drafts survive unchanged). Pure rules: `components/board/mission-control-scope.ts`.

**Routines and Files** do read across agents, and the rule still binds: they read through the
**existing per-agent keys**, never a new aggregate one.

- Routines fans out with `useQueries` over `routinesQueryOptions(path)` /
  `routineRunsQueryOptions(path)` — the same `queryKeys.routines(path)` /
  `queryKeys.routineRuns(path)` entries every other routines read uses. Files reads
  `useFiles(path)` for the one selected agent. So `use-agent-invalidation.ts` refreshes both
  surfaces from one event and the two can never serve different truths.
- Routines also fans out over `activityQueryOptions(path)` (the board's own key) to find each
  agent's unclaimed setup chats — its DRAFT rows.
- Routines has a FOURTH read, each agent's trigger health (`["agent-trigger-status", <agentId>]`,
  `use-team-trigger-statuses.ts`), because `RoutineTriggerStatus` renders for every
  trigger-bound row and a row handed no status says "Verifying trigger…" forever. It is
  enabled per agent ONLY when that agent owns an event routine (`triggerBoundRoutineIds`), so
  a workspace with none makes zero extra requests, and everything downstream — including the
  timeout that stops a row spinning — is the SHARED `useTriggerStatusViewModel`.
- The fan-out's observers set `refetchOnWindowFocus: false` **per observer**, so the
  single-agent reader (`routine-activation-chip.tsx` → `useAgentTriggerStatus`) keeps the
  default: an alt-tab must not re-fan-out to every pod nor fire one error toast per agent. The
  trigger fan-out builds from the query OPTIONS rather than calling `useAgentTriggerStatus`,
  which carries the per-agent error toast.
- **Every fan-out reduces through `teamFanOut` as `useQueries`' `combine`**
  (`team-fan-out.ts`). `useQueries` hands back a fresh results array each render; combining
  to PLAIN data lets React Query's structural sharing return the same object when nothing
  changed, so `aggregateTeamRoutines` and the trigger view model's memos actually hold —
  without it the merged list rebuilt every render and the timeout re-armed with it.
  `teamScopedAgents` is memoized in the section for the same reason. Retry goes through
  `queryClient.refetchQueries` with the failed agents' own keys, since the combined value
  carries no observer closures.
- Row actions route to the OWNER through `useRoutineWritesForAnyAgent()` — the same four
  writes with the agent in the mutation VARIABLES rather than the hook argument, because
  hooks may not be called in a loop over a changing roster.
- Two agents can hold routines with the same id, so rows are keyed on
  `teamRoutineKey(agentId, routineId)` (`team-routines-model.ts`, pure). A bare routine id
  would light two rows and route an action to whichever agent answered first.

**Partial failure is visible, never silent.** `agentReadFailures`
(`app/src/lib/agent-read-failures.ts`, pure) turns per-agent errors into a count plus the
failed agents' names; `AgentReadsFailed` (`app/src/components/agent-reads-failed.tsx`) renders
them as an inline strip above the content, with a Retry that refetches only what failed and
the standard Report-bug pill. A strip, not a toast: the fact is durable, and a background
refetch would fire one toast per unreachable agent. Routines folds ALL FOUR of its reads into
ONE strip (`mergeAgentReadFailures`) — an agent that failed several is still one missing
agent, named once, and a runs-500 counts (it strips every row of its last-run line and its
stop-the-run action). The strip is not a team thing: it lives inside the shared
`AgentFilesSurface` too.

**When NOTHING answered, the list stops making claims.** `allAgentReadsFailed`: with every
scoped agent failed, an empty grid is not evidence of an idle team, so the Routines empty
state swaps "Nothing runs on its own yet" for "Couldn't load this team's routines" and drops
its create button. An empty ROSTER is not this state; it has its own `TeamEmpty`.

**Agent id ↔ folder path.** The store pins an agent **id**; boards and dropdowns work in
**folder paths** (the key every mission card carries). `team-agent-filter-model.ts` owns both
pure translations (`teamFilterPath` / `teamFilterAgentId`). Every section reads the same
`teamAgentFilter`, so the rail's agent click narrows all three alike and each section's
dropdown (the one shared `AgentFilterMenu`) writes back. `team-agent-choice.ts` (pure)
resolves it per section shape: `teamScopedAgents` for the aggregating ones, `teamSelectedAgent`
for Files, which always has one agent open and falls back to the team's first — without
writing the pin back, which would silently filter the board too. Both drop a pin naming an
agent this team no longer holds. Team SETTINGS reads none of it (`sectionHonorsAgentPin`).

## Sidebar contract

Row geometry, presets and motion → **`sidebar-anatomy.md`**. Rail structure, drag-and-drop
and the `ui/layout` props → `agent-manifest.md` → *Sidebar structure*. The seam here:

### Composition

- `sidebar.tsx` composes what the rail KNOWS; `sidebar-rail.tsx` is the single `AppSidebar`
  invocation it renders twice (fixed rail, mobile drawer) from one `SidebarRailModel`.
- **`app/src/components/shell/use-sidebar-teams-model.ts` builds the lists**: it calls
  `partitionTeams` (defined `lib/server-teams-model.ts:120`) at `:89` and
  `buildTeamSidebarLists` (defined `shell/team-sidebar-lists.tsx:79`) at `:111`.
- Fold state is resolved once by `teamCollapsedLookup(layout)` (`team-sidebar-model.ts`),
  which handles the virtual default team via `SidebarLayout.defaultCollapsed`.

### Rows

- **Section rows** — one per `visibleTeamSectionsForTeam(caps, team)` entry, asked PER TEAM
  (the sidebar passes `buildTeamSidebarLists` a `sectionsForTeam` resolver, not one shared
  list), above the agent rows. Click →
  `openTeamView(teamId, section, { agentFilter: teamAgentFilter })`: **the pin RIDES ALONG**,
  because someone looking at Kai's missions means Kai's routines when they click that row
  next. A pin the destination team does not hold is dropped where it is read.
- **Agent rows** — click → `setCurrentAgent(agent)` **and**
  `openTeamView(team, "mission-control", { agentFilter: agent.id })`.
- Every team block wears `TeamGlyph` (`shell/team-glyph.tsx`) — the ONE component for a
  team's mark everywhere it is drawn: the stored icon in the stored colour, the charcoal
  rocket for an untouched default identity, the neutral `Users` mark for a team with no
  usable icon. A team's colour deliberately bends `sidebar-anatomy.md`'s no-pinned-colour
  invariant: it is picked identity, riding the agent palette.
- **`defaultGroup`** is `{ name, sections, collapsed, icon }`, the trailing block — the
  workspace's name locally, the server's own name for its default team on an `agentTeams`
  host. It renders and **collapses exactly like a named team**: a block that folded away
  everywhere except here would make the default team the one row that answers a click
  differently. It carries no drag handle on either backend; like every team, its
  actions live in Team Settings (no rail row carries any).
- Its collapsed state persists as the ADDITIVE **`SidebarLayout.defaultCollapsed`**
  (`packages/protocol/src/domain/workspace.ts:106`, host validator
  `packages/host/src/routes/sidebar-layout.ts:44`, `normalizeSidebarLayout`, the adapter's
  localStorage fallback which round-trips the whole object; toggled by
  `lib/sidebar-layout-ops.ts:89`). Absent reads as `false`, so every layout written before
  this is untouched. It needs its own field because the default team is VIRTUAL locally —
  it is the workspace, not a stored group, so there is no `layout.groups` row to hold a
  flag. The host is STRICT (a non-boolean rejects the whole parse, like `context`);
  `normalizeSidebarLayout` is LENIENT (a non-boolean falls back to absent, never `false`).

### Highlight (`app/src/lib/sidebar-teams.ts`, pure)

- Only `viewMode === TEAM_VIEW_ID` lights a team row. `resolveTeamHighlight` runs the stored
  section through `resolveTeamSection` against the **ACTIVE team's own**
  `visibleTeamSectionsForTeam` — another team's would answer about the wrong door. An empty
  list means the active team no longer resolves: nothing is lit, which is honest for the
  frame before `blockedTeamView` fires.
- `sidebarSelectedAgentId` fills the filtered agent's row only while the resolved SECTION
  honors the pin (`sectionHonorsAgentPin` — not Team Settings) AND that agent is still in the
  open team. The pin is not lost under Settings; the row lights again the moment a section
  that narrows by it is opened. It takes an optional `collapsed` and answers `null` for a
  collapsed team, whose agent rows are not drawn.
- **`teamRowActive({ teamId, collapsed, highlight })`** — collapsing a team hides its
  destination rows, so the row that would be lit is not rendered and the rail would go dark
  under a screen plainly on the glass. A COLLAPSED team that owns the open view takes the
  active pill and the `aria-current="page"` on the hidden row's behalf. It answers `false`
  whenever the team is EXPANDED (the destination row speaks for itself, and two fills in one
  block claim the user is in two places at once), whenever the highlight names another team
  or none, and whenever no section resolved.
- Both rules unit-tested in `app/tests/sidebar-teams.test.ts`.

### The band, and the ONE create menu

- **The rail has THREE bands and they are one COMPONENT.** "My accounts" and "Workspace"
  (over the top-level nav runs) and "Your teams" (over the blocks) are three instances of
  `SidebarBand` (`ui/layout/src/sidebar-band.tsx`, see `sidebar-anatomy.md` → *One band
  component*): same row primitive, same `band` type step (12px against the rows'
  13px, none of a block head's weight, same resting ink), same disclosure triangle
  immediately after the words so the label reads as a phrase you click, same fold, same
  persistence. A rail that folded one of them differently would be teaching two rules for one
  row shape. **Size, not weight or greyness, distinguishes a band** — semibold `ink-muted`
  read as a heading bolted above a list instead of the first line of one. The two rows that
  LEAD the rail (Inbox, Agent Store) wear no band and fold nothing: there is no heading to
  fold them under.
- **Folding a band puts its whole run away, and the rail remembers.** Three persisted,
  device-scoped keys in the UI store — `teamsSectionCollapsed`, `myAccountsSectionCollapsed`,
  `workspaceSectionCollapsed`. The nav runs carry theirs on the `SidebarNavSection`
  (`collapsed` + `onToggleCollapsed`, read in `use-sidebar-nav-items.tsx`, rendered by
  `ui/layout/src/sidebar-rail-chrome.tsx`); "Your teams" carries its own as `AppSidebar`'s
  `sectionCollapsed` / `onToggleSectionCollapsed`, where `ui/layout/src/sidebar.tsx` computes
  `listHidden = !collapsed && sectionCollapsed`. **The icon rail ignores every fold** — the
  same `!collapsed` guard in both places. Folding is an expanded-rail idea, the icon rail has
  no band to fold from, and a run hidden there would leave a destination unreachable with
  nothing on screen to bring it back.
- **One "+" carries everything the rail can create.** `SidebarCreateMenu`
  (`app/src/components/shell/sidebar-create-menu.tsx`) is the band's single `sectionAction`:
  New agent and New team. It replaced two unnamed glyphs sitting on a row that already had a
  label (`other-teams-block.tsx` and `sidebar-new-team-button.tsx` are both DELETED, and
  `SidebarFooter` lost its `otherTeams` prop). The menu is only DRAWN when there is a choice:
  with exactly one thing to create it degrades to a plain icon button that does that thing,
  named for it, and with nothing at all it renders nothing. The single-item case is in
  practice always New team, since creating a team is not an admin power on a C13 host.
- **JOINING A TEAM IS GONE**, and with it `sidebar-join-team-menu.tsx`. A member now sees only
  the teams they are part of (the gateway filters the list), so there is no "other teams"
  bucket to browse and nothing to pin: people are added through Team Settings' Members card.
  The MODEL layer is deliberately untouched pending the server-side filter —
  `partitionTeams(...).other` has no production consumer left (only its own unit tests) and
  `useJoinAgentTeam` is unreferenced, both kept on purpose.
- **"New agent" is ALSO a visible row** at the foot of the list (`SidebarAddRow`, child depth,
  muted): creating an agent is the rail's primary action and a primary action may not live one
  level deep inside a menu. That row is the `newAgent` tour anchor.
- **Both direct actions run one tick AFTER the menu closes** (`setTimeout(run, 0)` on the
  item's `onSelect`), so Radix's focus-restore to the trigger cannot blur what the action
  just focused. "New team" opens the create dialog (name field + the identity picker), the
  same `TeamIdentityNameRow` the Change icon & name dialog renders.

### Server-backed rail semantics

Off-capability none of this fires: `partitionTeams` is a no-op, the affordance mask is
`undefined` (which the library reads as "every affordance the host wired a callback for"), and
every write goes to the stored layout exactly as before.

- **"Your teams" means JOINED.** The model splits `useTeams()` with `partitionTeams` and hands
  `buildTeamSidebarLists` only `joined`. Its `agents` input is narrowed the same way by
  `agentsInTeams(agents, joined)` (`team-sidebar-model.ts`): the grouped list drops every item
  no group claims into the trailing default block, so handing it the whole store while drawing
  only the joined teams would spill an unjoined team's agents into the default team's
  leftovers. The helper returns the SAME array when nothing is excluded, so the local backend
  is untouched down to object identity.
- **There is NO join door anywhere.** Team visibility became members-see-only-their-teams
  (gateway-side), so the rail draws `partitionTeams(...).joined` and nothing else. The band's
  "+" creates (new agent / new team); it never offers a team to join. The client-side mirror of
  the visibility filter is still outstanding — `partitionTeams`'s `other` half survives unread.
- **Unjoined teams are VIEWABLE.** The rail keeps them out of the blocks and keeps their agents
  out of the blocks above, but the SCREEN renders like any other: Mission Control, Routines and
  Files read the team they are handed and ask nothing about membership, and `blockedTeamView`
  does not bounce them. Refusing to draw the screen invented a gate the gateway does not have
  and made the command palette's jump to an agent in an unjoined team land silently on the
  dashboard (`teams-nav.spec.ts` walks exactly that jump). **Team Settings is unchanged** —
  still gated by `visibleTeamSectionsForTeam`, so the extra reach is the team's WORK, never its
  configuration. No Join button was added to the team view: the four sections own their own
  chrome and none has a trailing-action slot. Nothing lights in the rail while an unjoined team
  is open, which is honest — it is not one of "Your teams".
- **MEMBERSHIP GRANTS NOTHING.** C13's first non-negotiable and the one thing a future reader
  must not "improve": agent access is per-agent assignments and only that. Making a team gate
  access is a contract break.
- **Leave** lives in Team Settings → Settings, below the identity rows, because it acts on
  the CALLER's membership rather than on the group. Manager-gated like the door it lives
  behind: a plain member currently has no Leave surface (open product decision).
- **Creation is name-first.** Locally a group is minted immediately with a placeholder and
  renamed in place — harmless, the layout is the user's own. In a shared space that placeholder
  would be BROADCAST the instant it is clicked, so a server host mints nothing: "New team"
  appends a LOCAL draft row (`DRAFT_TEAM_ID = "team:draft"`, empty name, no sections, no
  affordances) only this user sees, opens it straight into inline rename, and POSTs
  `createAgentTeam(name)` on commit. The draft is never a drop target. An abandoned rename
  (Escape, or a blur with an empty or unchanged value) retires it through `onCancelRenameGroup`
  — without that signal a host cannot tell an abandoned name from a pending one and the phantom
  row stays forever. Creating a team is not an admin power server-side: any member may add one.
- **Drag across teams is a server write.** `onMoveItem(agentId, dest)` resolves the target as
  `dest.groupId ?? <the isDefault team's id>` (a real server id, never the local
  `DEFAULT_TEAM_ID` sentinel) and, when it differs from `teamOfAgent(...)`, fires
  `useMoveAgentToTeam` → `PUT /v1/agents/:slug/team`, optimistic with rollback. **Within-team
  reorder is overlay-only**: nothing moved teams, so there is nothing to tell the server. The
  overlay write recording the drop POSITION happens on both backends and in both cases.

  A cross-team drop is TWO optimistic writes that must AGREE, and their composition order is
  load-bearing. `crossTeamDropOverlay` (`lib/agent-team-patches.ts`, pure) normalizes the
  overlay against `moveAgentInTeams(teams, …)` — the roster the move ASSERTS — not the one still
  cached: pruned against the roster as it stands, the destination team does not hold the dropped
  agent yet, rule 7 deletes the id the drop just wrote, and the position is silently lost.
  Sequencing the two writes instead does not fix it: React Query runs `onMutate` a microtask
  after `mutate()`, so a synchronous overlay write that follows still reads the pre-move roster.
  The layout the write REPLACED travels with the mutation, and a refusal (`not_team_owner`)
  restores BOTH caches.
- **Reordering a team block is a `sortOrder` write.** Server-backed, team order is the server's
  (rule 1) and the overlay has no say, so the header drag routes through the team actions:
  `teamSortOrderBetween` picks the MIDPOINT of the two teams the block landed between
  (`first - 1` at the top, `last + 1` at the bottom) — one `PATCH`, rather than renumbering the
  list with one request per team, which would stop halfway at the first team the caller does not
  own — and `applyTeamSortOrder` patches the cached teams and re-sorts them the way the gateway
  will. Both pure, in `lib/agent-team-patches.ts`. The patch is applied SYNCHRONOUSLY at the
  call site rather than from `onMutate`, because a group drag releases its working copy the
  instant it ends and a patch landing a microtask later lets the block snap back for a frame.
  The one position it cannot express is between two teams that already share a `sortOrder`;
  neither the gateway nor the fake host mints duplicates, so that is corrupted data, not a flow.
- Every one of these writes lives in `use-server-team-actions.ts` rather than in `sidebar.tsx`,
  and each branches on `serverBacked` EXACTLY ONCE. The two DRAG writes are one module further
  down, `use-team-drag-writes.ts`, because they are the only ones that patch a cache
  optimistically and must undo it — same shape twice: snapshot, patch, fire, restore on refusal.
  The menu writes add no `onError` (the mutation hooks own that surface); the two optimistic ones
  add exactly one, for their own rollback.

## Tests

| Level | Where |
| --- | --- |
| Model (`app/tests/`) | `teams-model` (incl. the server-truth Settings gate and the not-joined block) · `server-teams-model` (**all seven merge rules by number**, plus no-default-team leftovers, an overlay naming an agent the team lost, a repeated slug, a corrupt stored overlay) · `agent-team-errors` (the flat gateway body, every expected code, and the codes that must stay bug reports) · `team-members-model` (row shaping and order, the never-editable self row, the read-only decision per face, Leave's user id, `teamNameCommit`) · `team-sidebar-model` (`agentsInTeams`, incl. the same-array identity return the local backend depends on) · `agent-team-patches` (the move, the cross-team drop's overlay pruned against the roster the move ASSERTS, the `sortOrder` midpoint and the reorder re-sort) · `sidebar-teams` (incl. the Settings pin gate, `teamRowActive`, the collapsed `sidebarSelectedAgentId`) · `team-agent-filter-model` · `team-agent-choice` (the stale-pin drop rule, all three shapes) · `mission-control-scope` · `team-routines-model` · `team-routine-drafts-model` · `agent-read-failures` · `agent-nav` (the destination map + the settings gate, incl. the optional team argument) · `agent-invalidation-plan` (`AgentsChanged` reaching the teams + member-prefix keys inside the workspace guard) · `workspace-tour-steps` |
| Wire | `ui/engine-client/tests/client-agent-teams.test.ts` (all nine methods' `{method, url, body}` and parse side, id encoding, and **"a 404 throws, it is NOT degraded"** for every one) · `packages/web/tests/agent-teams-urls.test.ts` (the adapter's whole URL strings, and a slash/percent-bearing id staying inside its own path segment) · `ui/layout/tests/sidebar-groups.test.ts` (the affordance mask: veto for rename/delete/context, opt-in for `leave`) · `ui/layout/tests/rune-clamp.test.ts` |
| Fake host | `packages/fake-host/src/server.test.ts` → *agent teams (C13)*, the only place the client's assumptions meet a server: each test pins a rule of the contract rather than an implementation detail (the EFFECTIVE `joined`/`owner`/`memberCount`, the role filter on `agentSlugs`, every refusal code, the `AgentsChanged` fan-out). Arm with `POST /__test__/agent-teams` `{teams?, personalSpace?}`, paired with `POST /__test__/capabilities {agentTeams: true}` |
| Wiring | `team-one-sweep.test.ts` — roster + scope to BOTH boards, the archive's panel release, the shared agent grid |
| e2e (`packages/web/e2e/`) | `teams-nav.spec.ts` (**the destination map, walked**) · `support/team-nav.ts` (the ONE helper specs navigate with: `openTeamSection`, `openAgentSettings`, `rail`, `screen` — the screen ON THE GLASS, since kept-alive screens leave every other board's cards in the DOM) · `sidebar-teams.spec.ts` (what the rail SAYS) · `team-view.spec.ts` (the screen behind each row is what the rail promised) · `team-routines-files.spec.ts` (aggregation with owner chips; a toggle reaching the OWNING agent's route with the id collision armed via `POST /__test__/routine-seq`; the draft row's create → resume → discard round trip; the Files dropdown switching trees; the failed-agent strip via `POST /__test__/fail-agent-reads`) · `team-manager-gate.spec.ts` (the PER-TEAM and per-agent Settings gates) · `agent-teams.spec.ts` (the SERVER backend: creation sending the TYPED name, Move to team with a refusal putting the agent back, the Members card's owner toggle, the default team's read-only list, the "New Team" placeholder + rename through Team Settings, the disabled-only-team Delete) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the screen
(incl. `teamView.defaultName` = "New Team" and the `settingsTabs`/`settings.policy`
families), `teams:agentTeams.*` for what the server backend adds, `teams:moveTeam.*` for
the move flow, `shell:sidebar.teamIcons.*` (233 icon labels) +
`shell:sidebar.teamIconConcepts.*` (the translated search vocabulary), and
`shell:sidebar.createMenu` / `newTeam` / `addAgent` for the band's create menu (en/es/pt).
