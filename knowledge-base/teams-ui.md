# Teams UI — the sidebar teams and the `team` screen

**This is the whole shell.** An agent has no screen of its own: every screen is a
top-level view, an agent's WORK is a slice of its team's sections, and an agent's
CONFIGURATION is the canonical settings page behind Team Settings.

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
| `app/src/lib/agent-nav.ts` | The PURE rules — `AgentNavTarget` (`board` / `routines` / `files` / `settings`), `agentDestination(teams, agentId, target)` → `{view:"team", teamId, section, agentFilter}` (or the honest `dashboard` fallback for an agent no team claims), and `canOpenAgentSettings(caps, agent, team?)`. Tests: `app/tests/agent-nav.test.ts` |
| `app/src/lib/open-agent.ts` | The IMPERATIVE half — `currentTeams()` (the same inputs `useTeams()` composes, read outside React and branched by the very same `resolveTeamsForBackend`), `openAgentBoard`, `openAgentSection("routines"\|"files")`, `openAgentSettings(agentId, section?)`. Settings is the one target that toasts rather than falling back, and it clears any armed one-shot first so a failed nav cannot fire later |

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
  no new wire shape. It renders when empty and carries none of a group's affordances (no
  menu, rename or delete). Every agent belongs to exactly ONE team; there is no "loose
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
  pure function is the wrong direction. Its store-free twin `currentTeams()` reads the same
  two caches (`getCurrentAgentTeams()` and
  `queryClient.getQueryData(queryKeys.capabilities())`). Two copies of that rule would let
  the rail and a keyboard shortcut resolve different teams for the same agent.

### The seven merge rules (`app/src/lib/server-teams-model.ts`, pure)

`resolveServerTeams(serverTeams, agents, layout)` merges the server's teams, the local
agent store and the ordering overlay into the `TeamView[]` everything renders.

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
6. **The joined/other split** is `partitionTeams` (`server-teams-model.ts:120`), on
   `server?.joined !== false`, preserving order. With no `server` facts — the local
   backend — everything is joined, so the split is a no-op.
7. **The overlay is ADJUSTED on write, never pruned.** `normalizeTeamOverlay(layout,
   serverTeams)` may only touch rows naming a LIVE server team, where it narrows
   `agentIds` to the agents that team actually holds (a stale drag order decays on the next
   write instead of accumulating) and fills a BLANK name from the server's own (a row
   upserted by a first collapse or first drop is born nameless via `blankOverlayGroup`).
   Every OTHER stored group is carried through untouched, in place. Deleting them fires on
   a personal space, which serves exactly ONE team — every local group the user ever built
   is "not live", and one drag used to persist their names, shared context and membership
   away for good. The price is an inert invisible row for a team someone else deleted,
   which cannot cost anyone their work. Normalizing on write rather than on read is
   deliberate: a read-side pass would touch the user's drag order during any window where
   the teams read is empty or in flight.

### The overlay

Server-backed, the stored `sidebar_layout` stops being the model and degrades to a
per-user **ORDERING OVERLAY** keyed by SERVER team id.

- Only `id`, `collapsed` and `agentIds` are ever read there. **`name` and `context` are
  inert** — the server names its teams, and nothing reads a group's shared context on a
  server host, which is why the rail's header menu withholds the context editor rather
  than offering one that promises an effect the agents would never see.
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

On a gateway that advertises `agentTeams`, a personal space serves exactly ONE team (the
default; every mutation answers `403 personal_space`). A user who had built LOCAL sidebar
groups in that space sees them **stop grouping** — the overlay preserves their agent ORDER,
not their grouping, because the server is now the authority and it says "all of them, the
default one". The groups are not destroyed: names, shared context and membership sit intact
in the overlay and come back if the capability ever goes away. Pinned by
`server-teams-model.test.ts` ("a personal space's single team does not erase the user's
local groups", plus the collapse-toggle and group-reorder writes that used to erase them).

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
| `DEFAULT_TEAM_ID = "team:default"` | Id of the virtual default team, LOCAL backend only. Server-backed the default team wears a real server id, so nothing may assume this sentinel when resolving a drop target |
| `TeamSectionId` | `"mission-control" \| "routines" \| "files" \| "settings"` |
| `TeamView` | `{ id, name, agents, isDefault, server? }` — one team, members in drag order |
| `ServerTeamFacts` | `{ joined, owner, memberCount, sortOrder }`, copied verbatim off the wire. Present ONLY on an `agentTeams` host: its **absence** is what keeps every rule byte-identical locally, so "is this team server-owned?" is asked everywhere as `team.server !== undefined` |
| `resolveTeams(agents, layout, workspaceName)` | The LOCAL backend: named teams in display order, then the default team. Built on `resolveSidebarSections` (`lib/agent-order.ts`), so membership and rail order are one resolution |
| `teamById` / `teamOfAgent` | Lookups (`teamById` takes `string \| null`) |
| `canSeeTeamSettings(caps)` | The ORG-WIDE half of the Settings gate, the only gate here predating C13 (reads caps, not a team). Single-player always; multiplayer org owner/admin. Read only on the LOCAL backend now. Lives in `lib/team-permissions.ts`, re-exported here |
| `visibleTeamSectionsForTeam(caps, team)` | **The ONE section list**, read by both the rail's rows and the view FOR THE SAME TEAM. See below |
| `resolveTeamSection(sections, requested)` | What ACTUALLY renders: the requested section when visible, else `sections[0]`. One rule absorbs every stale-store case |
| `sectionHonorsAgentPin(section)` | Whether the OPEN section narrows by `teamAgentFilter`. True for Mission Control / Routines / Files, false for Settings, which lists the whole team |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves — and ONLY that. Mirrors `blockedTopLevelView`. It deliberately does NOT ask whether the caller joined |
| `canRenameTeam` / `canDeleteTeam` / `canLeaveTeam` / `canJoinTeam` | `lib/team-permissions.ts`, re-exported here. Each answers twice, once per backend. See below |
| `resolveServerTeams` / `partitionTeams` / `normalizeTeamOverlay` | The SERVER backend, in `lib/server-teams-model.ts` |

**`visibleTeamSectionsForTeam`** yields `["mission-control","routines","files"]` for
everyone, `+ "settings"` when
`(team.server ? team.server.owner : canSeeTeamSettings(caps)) || team.agents.some(a => isAgentManager(caps, a))`.

- On a server-teams host the server's own `owner` for THAT team replaces the
  client-derived org-role half: it already folds in the org owner/admin (implicit owner of
  every team) and adds the EXPLICIT team owner, who configures their team without being an
  org admin. The agent-manager clause is untouched on both backends.
- Only Settings is gated: the other three show the team's WORK, and a member who may use
  the team's agents may see what they do and what they keep. It is **per team**, not per
  caller — the same person configures one team and only uses the next, so the rail asks
  again for every block it draws.

**Team-action gates** — affordance gates ONLY; the gateway is the sole enforcer and every
refusal is also an expected state. Rename: locally any named group (never the virtual
default, which wears the workspace's name); server-side the team OWNER, and the default
team IS renamable there. Delete: never the default on either backend, plus owner-only
server-side. Leave: server-only (`server.joined && !isDefault` — locally there is no
membership to give up). Join: server-only, `server.joined === false`.

## Store contract (`app/src/stores/ui.ts`)

- **Three FLAT team fields**, no nested object: `activeTeamId: string | null`,
  `teamSection: TeamSectionId | null`, `teamAgentFilter: string | null` (the **agent ID**
  every section narrows to; `null` = the whole team).
- **One writer sets all three at once** — `openTeamView(teamId, section, { agentFilter? })`,
  which also sets `viewMode: TEAM_VIEW_ID`, so the view is never half-set. Omitting
  `agentFilter` **clears** it (the rail passes the live pin through instead);
  `setTeamAgentFilter(agentId | null)` is a section dropdown writing back. The initial
  `viewMode` is `"dashboard"`, an honest landing that needs no correction effect.
- **`partialize` persists exactly THREE keys**: `sidebarCollapsed`,
  `teamsSectionCollapsed`, `filesViewMode` (`app/src/stores/ui.ts:435`). `reset()` keeps
  the same three (`:416`) — they are per-MACHINE layout prefs, not identity-scoped. None of
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
  and `blockedTeamView`, in `shell/use-workspace-view-guards.ts` (a dead team id resets
  `viewMode` to `dashboard`; `TeamView` renders `null` for that frame). A team the caller
  has not JOINED is not blocked — it renders.
- `useWorkspaceViewGuards(showAiModels)` is the shell's standing-rules module, called once
  from `workspace-shell.tsx`, holding three effects: (1) **the open view must exist** —
  `!isTopLevelView(viewMode)`, `blockedTopLevelView` (a role-hidden screen such as the AI
  Models hub) or `blockedTeamView` all reset to `DASHBOARD_VIEW_ID`; (2) **something is
  always current** — `currentAgent` picks no SCREEN any more, but provider routing, model
  prefs and the palette still read it, so the first agent adopts it when nothing has;
  (3) **one `tab_opened` point** — watching `viewMode` catches rail click, shortcut and
  programmatic redirect alike, fires on real transitions only, and skips `settings`, which
  emits its own (vocabulary: `production-infra.md`).

Keyboard ownership, the shared panel, and where a published mission-nav lands →
**`board-shell.md`**.

### The guided tour

Three files, mounted by `workspace-shell.tsx` behind `uiTourActive`:
`workspace-tour-overlay.tsx` (what renders), `workspace-tour.ts` (the step list),
`workspace-tour-steps.ts` (the anchor vocabulary + gates). It walks the ONE path the
product has — your teams in the rail → a team's Mission Control → starting a mission →
what the team runs on its own → the app-level destinations.

- **Typed step targets.** A step names an anchor from a closed union and builds its
  selector from it, never a hand-written string, so a renamed `data-tour-target` is a
  compile error instead of a spotlight that silently finds nothing. A team's section rows
  are addressed by a composed `teamId:section` selector.
- **Every step OPENS its destination on enter**, so the spotlight sits over the real
  surface rather than over the trigger.
- **A step whose anchor cannot render is dropped**, not stalled. The gate is exhaustive
  over the anchor union, so a new anchor cannot ship without declaring whether it lives in
  the sidebar rail — which is not always on screen (auto-collapsed narrow, drawer on
  mobile).
- `packages/web/e2e/teams-nav.spec.ts` walks the whole tour and asserts it ends on the
  team's Routines section with the seeded routine visible.

## Sections

- **Mission Control** (`team-mission-control.tsx`) — the team's active board, its archive,
  or `TeamMissionEmpty`. The three SWAP, as the global Mission Control does, so only the
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
- **Team Settings** (`team-settings.tsx`) — the team's name, then its agents as rows.
  `TeamAgentsList` renders the SAME `PermissionsAgentGrid`
  (`components/permissions/agent-grid.tsx`) Settings > Permissions does; opening a row
  drills into `AgentDetail`, the same canonical agent settings page, under a `BackBarScreen`
  labelled with the team, holding an agent **ID** rather than a snapshot so a share mutation
  keeps the page on live data.

Every section's empty-team state goes through `TeamEmpty` (`team-empty.tsx`): the default
team offers "create your first agent", a named team says to drag one in (a new agent would
land in the default team). Only the promise changes per section ("its missions" / "its
routines" / "the files it keeps").

### Team Settings — the deep-link door and the two server surfaces

- This section is the door EVERY deployment has onto the agent settings page (Settings >
  Permissions is the second, multiplayer owner/admin only — `agent-settings.md`), and it is
  the one programmatic navigation uses, so it honors a one-shot deep link.
- `useTeamSettingsNav` (`team-view/team-settings-nav-store.ts`) is a tiny zustand store of
  **two flat fields plus two actions** — `requestedAgentId: string | null`,
  `requestedSection: AgentSettingsSection | null`, `requestAgentDetail(agentId, section?)`,
  `clearRequested()`. Not a nested request object and not part of the UI store, which would
  re-render every team surface on a navigation only one cares about. A caller sets the
  request right before `openTeamView(team, "settings")` (the live one is a turn summary's
  "the agent updated its job description" link, through `openAgentSettings`). The view
  consumes it on mount AND while already open, then clears it, so a later plain click on the
  Settings row lands back on the agent list.
  *(Its header comment still cites a sibling `permissions/permissions-nav-store.ts` — that
  store is DELETED. Permissions has no deep link at all; the comment is stale.)*
- **On a server-teams host the page grows two surfaces a team owns beyond its agents**, both
  hung off `team.server !== undefined` so the page stays byte-identical on the local backend
  (where the header is the read-only `PageHeader title={team.name}` it has always been):
  - **The team's name**, editable in place (`team-name-field.tsx`) when `canRenameTeam(team)`.
    This is the DEFAULT team's only rename door — its rail block deliberately carries no
    menu, yet its name is what every member reads at the top of the rail. The field is
    seeded with the saved name and REMOUNTED by its `key` when that name changes, so it
    re-syncs to server truth without an effect that could overwrite what the user is typing.
    Save is disabled until `teamNameCommit(draft, saved)` says the write would change
    something, so the button never promises a write the gateway would refuse.
  - **The Members card** (`team-members-card.tsx`, pure half `team-members-model.ts`) — the
    team's **EXPLICIT membership rows only**, from `useAgentTeamMembers`, which is why it
    always ships the **effective note**: the space's owners and admins run every team without
    holding a row (C13 resolves implicit ownership, never stores it), so a roster read on its
    own would claim a team nobody is in charge of. Writes are **owner-gated**
    (`team.server.owner`): an owner-flag toggle and a remove, both absent otherwise, and
    never on the caller's OWN row — demoting or removing yourself is the same wire call as
    leaving, and the card already offers Leave as one deliberate action. The **default team
    is READ-ONLY per the wire** (every member write answers `400 default_team` and it holds
    no explicit rows), so it renders its note INSTEAD of a roster and never fires the
    membership read. There is no Join counterpart here: joining is sidebar pinning, this
    card's writes are owner-gated either way, and keeping the act in one place (the rail's
    "Join a team" submenu, which Leave puts a team straight back into) makes it one
    deliberate click. A failed read says it failed rather than rendering as an empty team.

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
- Every team block wears the same monochrome `Users` glyph (`TEAM_ICON`,
  `team-sidebar-lists.tsx:44`).
- **`defaultGroup`** is `{ name, sections, collapsed, icon }`, the trailing block — the
  workspace's name locally, the server's own name for its default team on an `agentTeams`
  host. It renders and **collapses exactly like a named team**: a block that folded away
  everywhere except here would make the default team the one row that answers a click
  differently. It still carries no header menu and no drag handle on either backend, which
  is why Team Settings remains the only place its name can be edited.
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

- Above the blocks sits the rail's list header, `SidebarSectionHeader` — one per rail however
  many blocks hang under it. Same row primitive in the `band` type step: 12px against the
  rows' 13px, none of a block head's weight, same resting ink. The LABEL is the toggle, with
  the disclosure triangle immediately after the words, so it reads as a phrase you click.
  **Size, not weight or greyness, distinguishes it** — semibold `ink-muted` read as a heading
  bolted above a list instead of the first line of one.
- **Folding it puts every block away at once, and the rail remembers.** The state is
  `teamsSectionCollapsed` in the UI store (`stores/ui.ts:162`, toggle `:412`), persisted and
  device-scoped. `sidebar.tsx:47` reads it and passes it as `sectionCollapsed` (`:116`) with
  `onToggleSectionCollapsed` (`:117`); `ui/layout/src/sidebar.tsx:63` computes
  `listHidden = !collapsed && sectionCollapsed`. The `!collapsed` guard is why the icon rail
  can never inherit a hidden list — folding is an expanded-rail idea, and the icon rail has no
  band to fold from.
- **One "+" carries everything the rail can create or acquire.** `SidebarCreateMenu`
  (`app/src/components/shell/sidebar-create-menu.tsx`) is the band's single `sectionAction`:
  New agent, New team, and a "Join a team" submenu (`sidebar-join-team-menu.tsx`,
  scroll-bounded `max-h-72`) listing `partitionTeams(...).other`. It replaced three
  affordances for one idea — a "+" beside the label, a New team glyph next to it, and the
  "Other teams" disclosure at the foot of the rail (`other-teams-block.tsx` and
  `sidebar-new-team-button.tsx` are both DELETED, and `SidebarFooter` lost its `otherTeams`
  prop). The menu is only DRAWN when there is a choice: with exactly one thing to create and
  nothing joinable it degrades to a plain icon button that does that thing, named for it, and
  with nothing at all it renders nothing. The single-item case is never Join on its own,
  because a host that lists unjoined teams is a C13 host and there any member may create a
  team.
- **"New agent" is ALSO a visible row** at the foot of the list (`SidebarAddRow`, child depth,
  muted): creating an agent is the rail's primary action and a primary action may not live one
  level deep inside a menu. That row is the `newAgent` tour anchor.
- **Both direct actions run one tick AFTER the menu closes** (`setTimeout(run, 0)` on the
  item's `onSelect`). Radix restores focus to the trigger when the content unmounts ~20ms
  later — comfortably after a synchronous "New team" has mounted the new block's inline-rename
  input and focused it. The restore blurs the field, the blur commits an unchanged draft, and
  `useGroupRename` ends the session as an ABANDONMENT, leaving a team literally called "New
  team". `onCloseAutoFocus` preventDefault does not cover it. The team header's own "..." menu
  escapes it only by accident (its trigger unmounts with the row).
- The trigger wears the library's own `sidebarRowAffordanceClasses`, imported rather than
  restated — it sits in a `SidebarRowButton`'s affordance slot beside every team's "..." menu.

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
- **An unjoined team lives in the band's Join menu, and nowhere else.** The taxonomy is
  unchanged from the deleted "Other teams" block, only the door: the entry is ABSENT rather
  than empty when nothing is left to join, and each row names its team and how many people are
  in it, because the choice must never be made on a bare name. It stays APP-level, not a new
  `ui/layout` slot: the library knows about groups, not about membership in a shared space.
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
- **JOINING IS SIDEBAR-PINNING AND IT GRANTS NOTHING.** C13's first non-negotiable and the one
  thing a future reader must not "improve": every team listed is one the gateway ALREADY lets
  this caller see, and joining only moves it up into "Your teams". No agent, file or permission
  changes hands. Agent access is per-agent assignments and only that; making a team gate access
  is a contract break. It is also why Join can sit in the open with no confirmation — the worst
  outcome is a team in your sidebar you did not want, and Leave puts it straight back.
- **Leave** is the last item of the team header menu, below a separator, because it acts on the
  CALLER's membership rather than on the group. In `ui/layout` it is the one **opt-in**
  affordance: `groupAllows` treats the mask as a veto for rename/delete/context, but `leave`
  shows only on an explicit `true`, so a host with no notion of joining a group can never
  acquire a way out of one by staying silent. The app withholds it with no session id, since
  there would be no `:userId` to send.
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
| e2e (`packages/web/e2e/`) | `teams-nav.spec.ts` (**the destination map, walked**) · `support/team-nav.ts` (the ONE helper specs navigate with: `openTeamSection`, `openAgentSettings`, `rail`, `screen` — the screen ON THE GLASS, since kept-alive screens leave every other board's cards in the DOM) · `sidebar-teams.spec.ts` (what the rail SAYS) · `team-view.spec.ts` (the screen behind each row is what the rail promised) · `team-routines-files.spec.ts` (aggregation with owner chips; a toggle reaching the OWNING agent's route with the id collision armed via `POST /__test__/routine-seq`; the draft row's create → resume → discard round trip; the Files dropdown switching trees; the failed-agent strip via `POST /__test__/fail-agent-reads`) · `team-settings-manager.spec.ts` (the PER-TEAM Settings gate — and it must keep passing UNCHANGED, which is the standing proof that the capability-off path is byte-identical) · `agent-teams.spec.ts` (the SERVER backend: joined/other split with one-click Join, creation sending the TYPED name, a cross-team drag moving the agent and a refusal putting it back, the Members card's owner toggle, the default team's read-only list, the per-team Settings gate, a cross-team drop landing WHERE it was dropped and surviving a reload, a team-header drag `PATCH`ing `sortOrder` without touching the overlay) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the screen,
`teams:agentTeams.*` for everything the server backend adds (`joinTeam` and its per-team
`joinNamed_one`/`joinNamed_other`/`joiningNamed` accessible names, Join/Leave, the member count
plural, the Settings name field and Members card, and the five expected-error title/body pairs),
plus `shell:sidebar.teams.leave` and `shell:sidebar.createMenu` / `shell:sidebar.newTeam` /
`shell:sidebar.addAgent` for the band's one create menu (en/es/pt).
