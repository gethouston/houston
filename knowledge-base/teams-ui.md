# Teams UI — the sidebar teams and the team view

**Not `teams.md`.** That doc is MULTIPLAYER orgs: roles, spaces, seats, sharing,
all gateway-enforced. This is the **client-side team surface** — how the sidebar
groups agents into teams and what the `team` screen behind each row does. It
exists single-player too, where the solo user is every team's owner. The only
thing the two share is `Capabilities`: the org role decides which team sections a
caller may open.

## What a team is

A team is a **named home for agents**, drawn from the workspace's stored
`sidebar_layout`: a **named team** IS a stored sidebar group (`SidebarGroup`);
the **default team** is the workspace itself, wearing the workspace's name and
holding every agent in no group. The default team is **virtual** — nothing is
written to `sidebar_layout` to make it exist, so there is no stored-layout
migration and no new wire shape. It renders when empty and carries none of a
group's affordances (no caret, rename or delete). Every agent therefore belongs
to **exactly one** team, and the rail has no "loose agents" remainder.

## `app/src/lib/teams-model.ts` — the model

| Export | What it is |
| --- | --- |
| `TEAM_VIEW_ID = "team"` | The one `viewMode` every team shares. |
| `DEFAULT_TEAM_ID = "team:default"` | Id of the virtual default team. |
| `TeamSectionId` | `"mission-control" \| "routines" \| "files" \| "settings"`. |
| `TeamView` | `{ id, name, agents, isDefault }` — one team, members in drag order. |
| `resolveTeams(agents, layout, workspaceName)` | Named teams in display order, then the default team. Built on `resolveSidebarSections` (`lib/agent-order.ts`), so team membership and rail order are one resolution. |
| `teamById` / `teamOfAgent` | Lookups (`teamById` takes `string \| null`). |
| `canSeeTeamSettings(caps)` | Single-player: always. Multiplayer: org owner/admin (implicit owners of every team, C13). |
| `visibleTeamSections(caps)` | **The ONE section list**, read by both the rail's rows and the view, so a section can never have a row and be unreachable (or the reverse). `["mission-control","routines","files"]` for everyone, `+ "settings"` for `canSeeTeamSettings`. Only Settings is gated because the other three show the team's WORK, and a member who may use the team's agents may see what they do on their own and what they keep; Settings is the only one that CONFIGURES. |
| `resolveTeamSection(sections, requested)` | What ACTUALLY renders: the requested section when visible, else `sections[0]`. One rule absorbs every stale-store case. |
| `sectionHonorsAgentPin(section)` | Whether the OPEN section narrows by `teamAgentFilter`. True for Mission Control / Routines / Files, false for Settings, which lists the whole team whatever the pin says. The rail's agent-row fill reads it. |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves. Mirrors `blockedTopLevelView`. |

`useTeams()` (`app/src/hooks/use-teams.ts`) is the **single resolution path** —
`resolveTeams` over the agent store, the cached sidebar layout and the workspace
name, memoized. The sidebar, the team view and the workspace shell's guard all
call it, so the rail can never disagree with the screen it navigates to. With no
workspace it returns `[]`, which is what `blockedTeamView` reads.

## Store contract (`app/src/stores/ui.ts`)

`activeTeamId` (which team), `teamSection` (which of its sections) and
`teamAgentFilter` (the **agent ID** every section narrows to, `null` = the whole
team) are always set together by `openTeamView(teamId, section, { agentFilter? })`,
so the view is never half-set; omitting `agentFilter` **clears** it (the rail
passes the live pin through instead), and `setTeamAgentFilter` is a section
dropdown writing back. None is persisted
(`partialize` keeps only `sidebarCollapsed` / `filesViewMode`), so "stale" means
within a session — typically a space switch changing the caller's role.

## The `team` top-level view

`TEAM_VIEW_ID` is registered in `lib/top-level-views.ts` and mounted by
`topLevelScreenViews` — **one** kept-alive screen for every team, so renaming,
reordering or deleting a team can never orphan a view id. `TeamView`
(`team-view.tsx`) reads `useTeams()` + `activeTeamId` + `teamSection`, resolves
the section, and keys its child on the team id so switching teams starts clean.
Two guards, no third: `resolveTeamSection` (never a blank pane) and
`blockedTeamView`, in `workspace-shell.tsx`'s view-reset effect (a dead team id
resets `viewMode` to `dashboard`; `TeamView` renders `null` for that frame).

### Keyboard and the ONE shell panel

`isMissionBoardView(viewMode)` (dashboard **or** team) makes ⌘N, the command
palette, the board arrows and bare Enter act where the user IS. Everything below
follows from **several kept-alive screens being mounted at once**, so anything a
screen publishes into the UI store or portals into the shared panel is
last-writer-wins.

- **Every registration is gated on `useIsActiveView()`** — `onStartMission`
  (`use-mc-new-mission.tsx`), `onBoardNavigate` / `onBoardOpen` / `onPanelClose`
  (`use-board-keyboard.ts`), the empty-board auto-open, and the team Routines
  panel's own portal + claim. Unconditional registration let a HIDDEN team board
  keep the arrows, so Enter opened an invisible mission's chat into the shared
  panel. The guard is `if (!isActive) return;` with **no** cleanup on the
  inactive path: React runs the whole commit's destroy pass before its create
  pass, so the outgoing screen releases and the incoming one claims, in that
  order. Nulling from the inactive path would clobber the screen that just
  claimed.
- **Going inactive releases everything the screen holds of the ONE panel** — the
  open mission, the claim, AND the empty new-mission composer (reachable only
  through the closer `AIBoard` hands back). Skipping it left `showPanel` stuck
  true and the panel could never reopen (HOU-1165). `MissionControlArchived` and
  the team Routines panel carry their own copies, being no `MissionBoard`.
- **⌘N and the palette check for the handler, not just the view**, since Team
  Settings, Routines, Files and an empty team mount no board: both guard on
  `isMissionBoardView(viewMode) && onStartMission`.

### Sections

- **Mission Control** (`team-mission-control.tsx`) — the team's active board, its
  archive, or `TeamMissionEmpty`. The three SWAP, as the global Mission Control
  does, so only the on-screen surface runs hooks and claims the panel. It owns
  the full roster + the shared scope for both boards (*The one-sweep rule*).
- **Routines** (`team-view/team-routines/`) — ONE list of every team agent's
  routines, each row naming its owner. Aggregating is honest: a routine is a flat
  row. Routines still being BUILT in chat are rows too (`team-routine-drafts-model.ts`
  + `use-team-routine-drafts.ts`): a draft is an unclaimed setup ACTIVITY, invisible
  to any routines read, and without those rows a routine half-started from this
  surface vanishes from the list the moment its chat closes — under a grid still
  claiming nothing runs on its own. They resume and discard from the row, wear the
  owner chip, and light while their chat is open. See *The one-sweep rule*.
- **Files** (`team-view/team-files/`) — the opposite call: folders nest, so
  merging trees would invent a filesystem nobody has, with no honest answer to
  where an upload lands. It picks ONE agent and mounts `AgentFilesSurface`
  (`components/tabs/agent-files/`) — the very component the per-agent Files tab
  mounts, keyed on the agent — so the browser, every action and the failure strip
  are one implementation (`knowledge-base/files-ui.md`).
- **Team Settings** (`team-settings.tsx`) — the team's name, then its agents as
  rows. `TeamAgentsList` renders the SAME `PermissionsAgentGrid`
  (`components/permissions/agent-grid.tsx`) Settings > Permissions does. Opening
  a row drills into `AgentDetail`, the **same** canonical agent settings page,
  under a `BackBarScreen` labelled with the team, holding an agent **ID** rather
  than a snapshot so a share mutation keeps the page on live data.

Every section's empty-team state goes through `TeamEmpty` (`team-empty.tsx`): the
default team offers "create your first agent", a named team says to drag one in,
because a new agent would land in the default team. Only the promise changes per
section ("its missions" / "its routines" / "the files it keeps").

## The one-sweep rule

**No team surface may start a cross-agent read that duplicates an existing one.**

**Mission Control.** Both of a team's boards — the ACTIVE one (`TeamMissionBoard`
→ `useMissionControlSource`) and the ARCHIVE (`MissionControlArchived` →
`useMissionControlArchived`) — are handed the **full workspace roster** plus a
`MissionControlScope` (`components/board/use-mc-scope.ts`: `scopePaths`, `title`,
`teamId`, `filterPath`, `onFilterPathChange`). `team-mission-control.tsx` is the ONE
owner of both: it reads the roster from the agent store, builds the scope with
`useTeamBoardScope(team)` (before the empty-team early return — hooks may not run
conditionally), and hands the same two values to whichever surface is up.
`scopePaths === undefined` → the global board; an **array**, empty included, →
one team. The scope only narrows what the board RENDERS, through the one
narrowing path `useMcScope(agents, items, scope)`.

Handing a surface only the team's agents mints a SECOND `all-conversations` key,
and three defects follow: a second cross-agent fan-out per team (a pod-wake storm
on cold agents); `retargetSweepRecovery(roster)` seeing a different roster string
and cancelling the pending global re-sweep, breaking HOU-981's recovery; and
`latestCachedAllConversations` picking the newest successful variant of the
prefix, so a team's NARROW result seeds the global board as placeholder data.
The archive shipped with exactly this bug. The scope also carries `title` (which
`MissionControlToolbar` composes with the mode — `"{{name}} · Archived"` — so a
team's archive never reads like its active board) and `teamId` (today only
`missionControlDraftScope`, which yields the bare `"mission-control"` globally so
stored drafts survive unchanged). Pure rules:
`components/board/mission-control-scope.ts`.

**Routines and Files** do read across agents, and the rule still binds: they read
through the **existing per-agent keys**, never a new aggregate one.

- Routines fans out with `useQueries` over `routinesQueryOptions(path)` /
  `routineRunsQueryOptions(path)` (`hooks/queries/use-routines.ts`) — the SAME
  `queryKeys.routines(path)` / `queryKeys.routineRuns(path)` entries the
  per-agent tab reads. Files reads `useFiles(path)` for the one selected agent
  (`queryKeys.files(path)`). So `use-agent-invalidation.ts` refreshes both
  surfaces from one event, every mutation's existing invalidation lands in one
  place, and the two can never serve different truths. An aggregate key would be
  a second source of that truth and a second thing to keep warm.
- Routines also fans out over `activityQueryOptions(path)` (`queryKeys.activity(path)`,
  the board's own key) to find each agent's unclaimed setup chats — its DRAFT
  rows. Same rule, same key, same invalidation.
- Routines has a FOURTH read, each agent's trigger health
  (`["agent-trigger-status", <agentId>]`, `use-team-trigger-statuses.ts`), and
  it exists because `RoutineTriggerStatus` renders for every trigger-bound row:
  a row handed no status says "Verifying trigger…" forever, which is a claim the
  list could never settle. It is enabled per agent ONLY when that agent owns an
  event routine (the tab's own rule, `triggerBoundRoutineIds`), so a workspace
  with none makes zero extra requests, and everything downstream — including the
  timeout that stops a row spinning — is the SHARED `useTriggerStatusViewModel`
  the tab runs.
- The fan-out's observers set `refetchOnWindowFocus: false` (per-observer, so the
  per-agent tab keeps its default): an alt-tab must not re-fan-out to every pod,
  nor fire one error toast per agent. The trigger fan-out deliberately builds
  from the query OPTIONS rather than calling `useAgentTriggerStatus`, because
  that hook carries the per-agent error toast.
- **Every fan-out reduces through `teamFanOut` as `useQueries`' `combine`**
  (`team-fan-out.ts`, the shape `use-workspace-skills.ts` uses). `useQueries`
  hands back a fresh results array each render; combining to PLAIN data lets
  React Query's structural sharing return the same object when nothing changed,
  so `aggregateTeamRoutines` and the trigger view model's memos actually hold.
  Without it the merged list was rebuilt every render and the timeout that stops
  a trigger row saying "verifying" re-armed with it. `teamScopedAgents` is
  memoized in the section for the same reason (a pinned scope is a fresh
  one-element array otherwise). Retry goes through
  `queryClient.refetchQueries` with the failed agents' own keys, since the
  combined value carries no observer closures.
- Row actions route to the OWNER through `useRoutineWritesForAnyAgent()` — the
  same four writes with the agent in the mutation VARIABLES rather than the hook
  argument, because hooks may not be called in a loop over a changing roster.
  Same routes, same `call()` toast path, same invalidation helpers.
- Two agents can hold routines with the same id, so rows are keyed on
  `teamRoutineKey(agentId, routineId)` (`team-routines-model.ts`, pure). A bare
  routine id would light two rows and route an action to whichever agent
  answered first.

**Partial failure is visible, never silent.** `agentReadFailures`
(`app/src/lib/agent-read-failures.ts`, pure) turns per-agent errors into a count
plus the failed agents' names; `AgentReadsFailed`
(`app/src/components/agent-reads-failed.tsx`) renders them as an inline strip
above the content, with a Retry that refetches only what failed and the standard
Report-bug pill (`components/cards/report-bug-button.tsx`, the one the
provider-error cards mount). Dropping them (`.catch(() => [])`) would present
four agents' routines as the team's routines with nobody the wiser. A strip, not
a toast: the fact is durable, and a background refetch would fire one toast per
unreachable agent. Routines folds ALL FOUR of its reads into ONE strip
(`mergeAgentReadFailures`) — an agent that failed several is still one missing
agent, named once, and a runs-500 counts: it strips every row of its last-run
line and its stop-the-run action.

The strip is not a team thing: the per-agent Files tab renders it too, through
the shared `AgentFilesSurface`, because an empty tree and a broken tree look
identical there as well.

**When NOTHING answered, the list stops making claims.** `allAgentReadsFailed`
is the decision: with every scoped agent failed, an empty grid is not evidence
of an idle team, so the Routines empty state swaps "Nothing runs on its own yet"
for "Couldn't load this team's routines" and drops its create button — Retry in
the strip is the only honest next move. An empty ROSTER is not this state; it
has its own honest `TeamEmpty`.

**Agent id ↔ folder path.** The store pins an agent **id**; boards and dropdowns
work in **folder paths** (the key every mission card carries).
`team-agent-filter-model.ts` owns both pure translations (`teamFilterPath` /
`teamFilterAgentId`). Every section reads the same `teamAgentFilter`, so the
rail's agent click narrows all three alike and each section's dropdown (the one
shared `AgentFilterMenu`) writes back. `team-agent-choice.ts` (pure) resolves it
per section shape: `teamScopedAgents` for the aggregating one, `teamSelectedAgent`
for Files, which always has one agent open and falls back to the team's first —
without writing the pin back, which would silently filter the board too. Both
drop a pin naming an agent this team no longer holds. Team SETTINGS reads none of
it (`sectionHonorsAgentPin`): it lists the whole team, so the rail fills no agent
row while it is open.

## Sidebar contract

Rail anatomy, drag-and-drop, i18n keys and the `ui/layout` props are in
[agent-manifest.md](agent-manifest.md) → *Sidebar structure*. The seam here:

- **Section rows** — one per `visibleTeamSections(caps)` entry, above the agent
  rows. Click → `openTeamView(teamId, section, { agentFilter: teamAgentFilter })`:
  the pin RIDES ALONG, because someone looking at Kai's missions means Kai's
  routines when they click that row next. A pin the destination team does not
  hold is dropped where it is read. **Agent rows** — click →
  `setCurrentAgent(agent)` **and** `openTeamView(team, "mission-control",
  { agentFilter: agent.id })`. **`defaultGroup`** is
  `{ name: workspaceName, sections }`, the non-collapsible trailing block.
- **Highlight** — pure, in `app/src/lib/sidebar-teams.ts`. Only
  `viewMode === TEAM_VIEW_ID` lights a team row; `resolveTeamHighlight` runs the
  stored section through **`resolveTeamSection` against the same
  `visibleTeamSections`** the view uses. `sidebarSelectedAgentId` fills the
  filtered agent's row only while the resolved SECTION honors the pin
  (`sectionHonorsAgentPin` — not Team Settings) AND that agent is still in the
  open team. The pin is not lost under Settings; the row lights again the moment
  a section that narrows by it is opened.

## Tests

| Level | Where |
| --- | --- |
| Model (`app/tests/`) | `teams-model`, `sidebar-teams` (incl. the Settings pin gate), `team-agent-filter-model`, `team-agent-choice` (the stale-pin drop rule, all three shapes), `mission-control-scope`, `team-routines-model`, `team-routine-drafts-model`, `agent-read-failures` (counting, merging, and `allAgentReadsFailed`) |
| Wiring | `team-one-sweep.test.ts` — roster + scope to BOTH boards, the archive's panel release, the shared agent grid |
| e2e (`packages/web/e2e/`) | `sidebar-teams.spec.ts` (what the rail SAYS) · `team-view.spec.ts` (the screen behind each row is what the rail promised: title + scope, the agent-filter round trip, the Settings drill-in, the member's rows, the archive's composed title and its panel release) · `team-routines-files.spec.ts` (aggregation with owner chips; a toggle reaching the OWNING agent's route with the id collision armed for real via `POST /__test__/routine-seq`, asserted on the request URL; the draft row's create → resume → discard round trip; the Files dropdown switching trees; the failed-agent strip via `POST /__test__/fail-agent-reads`, including a runs-only failure and the all-agents-failed copy) · `board-keyboard-ownership.spec.ts` (only the screen on the glass owns the arrows and Enter) · `shell-panel-ownership.spec.ts` (the shared panel, including the TEAM Routines chat releasing it when the team leaves the glass and taking it back on return) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the
screen (en/es/pt).
