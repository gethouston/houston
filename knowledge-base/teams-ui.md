# Teams UI — the sidebar teams and the team view

**This is the whole shell.** An agent has no screen of its own. Every screen is a
top-level view, an agent's WORK is a slice of its team's sections, and an agent's
CONFIGURATION is the canonical settings page behind Team Settings.

Two modules own the one translation from "agent X's `<thing>`" to a team view, so a
notification, a @mention row, the command palette and a turn summary can never land three
different places:

| Module | Half |
| --- | --- |
| `lib/agent-nav.ts` | The PURE rules — `AgentNavTarget` (`board` / `routines` / `files` / `settings`), `agentDestination(teams, agentId, target)` → a `{view:"team", teamId, section, agentFilter}` (or the honest `dashboard` fallback for an agent no team claims), and `canOpenAgentSettings(caps, agent)`. Unit-tested: `app/tests/agent-nav.test.ts` |
| `lib/open-agent.ts` | The IMPERATIVE half — `currentTeams()` (the same three inputs `useTeams()` composes, read outside React), `openAgentBoard`, `openAgentSection("routines"\|"files")`, `openAgentSettings(agentId, section?)`. Settings is the one target that toasts rather than falling back, and it clears any armed one-shot first so a failed nav cannot fire later |

The destination MAP itself (which surface answers for which agent thing) is
`agent-manifest.md` → *Where an agent's surfaces live*; `packages/web/e2e/teams-nav.spec.ts`
drives it end to end.

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
| `canSeeTeamSettings(caps)` | The ORG-WIDE half of the Settings gate. Single-player: always. Multiplayer: org owner/admin (implicit owners of every team, C13). Not the whole gate on its own — see the row below. |
| `visibleTeamSectionsForTeam(caps, team)` | **The ONE section list**, read by both the rail's rows and the view FOR THE SAME TEAM, so a section can never have a row and be unreachable (or the reverse). `["mission-control","routines","files"]` for everyone, `+ "settings"` when `canSeeTeamSettings(caps) \|\| team.agents.some(a => isAgentManager(caps, a))`. Only Settings is gated because the other three show the team's WORK, and a member who may use the team's agents may see what they do on their own and what they keep; Settings is the only one that CONFIGURES — so it goes to anyone who may configure SOMETHING here: the org owner/admin, or a member who manages at least one of THIS team's agents. It is **per team**, not per caller: the same person configures one team and only uses the next, so the rail asks again for every block it draws. |
| `resolveTeamSection(sections, requested)` | What ACTUALLY renders: the requested section when visible, else `sections[0]`. One rule absorbs every stale-store case. |
| `sectionHonorsAgentPin(section)` | Whether the OPEN section narrows by `teamAgentFilter`. True for Mission Control / Routines / Files, false for Settings, which lists the whole team whatever the pin says. The rail's agent-row fill reads it. |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves. Mirrors `blockedTopLevelView`. |

`useTeams()` (`app/src/hooks/use-teams.ts`) is the **single resolution path** —
`resolveTeams` over the agent store, the cached sidebar layout and the workspace
name, memoized. The sidebar, the team view and the workspace shell's guard all
call it, so the rail can never disagree with the screen it navigates to. With no
workspace it returns `[]`, which is what `blockedTeamView` reads.

## Store contract (`app/src/stores/ui.ts`)

Three FLAT fields, no nested team object: `activeTeamId: string | null` (which team),
`teamSection: TeamSectionId | null` (which of its sections) and `teamAgentFilter: string |
null` (the **agent ID** every section narrows to, `null` = the whole team). One writer sets
all three at once — `openTeamView(teamId, section, { agentFilter? })`, which also sets
`viewMode: TEAM_VIEW_ID` — so the view is never half-set; omitting `agentFilter` **clears**
it (the rail passes the live pin through instead), and `setTeamAgentFilter(agentId | null)`
is a section dropdown writing back. The initial `viewMode` is `"dashboard"`, an honest
landing that needs no correction effect. None of the four is persisted (`partialize` keeps
only `sidebarCollapsed` / `filesViewMode`), so "stale" means within a session — typically a
space switch changing the caller's role.

**There is no highlight state in the store.** Which rail row is lit is DERIVED, purely, in
`lib/sidebar-teams.ts` (see *Sidebar contract*) — a stored highlight would be a second
source of truth for something the three fields above already determine.

One more team-shaped field lives here: `pendingRoutineChat: {agentId, activityId} | null`,
the one-shot nav target for a routine chat with no board card (a session-finished
notification click). The owning agent travels WITH the id because the Routines section is
cross-agent and would otherwise have to guess whose chat the id belongs to.

## The `team` top-level view

`TEAM_VIEW_ID` is registered in `lib/top-level-views.ts` and mounted by
`topLevelScreenViews` — **one** kept-alive screen for every team, so renaming,
reordering or deleting a team can never orphan a view id. `TeamView`
(`team-view.tsx`) reads `useTeams()` + `activeTeamId` + `teamSection`, resolves
the section, and keys its child on the team id so switching teams starts clean.
Two guards, no third: `resolveTeamSection` (never a blank pane), inside `TeamView`; and
`blockedTeamView`, in **`shell/use-workspace-view-guards.ts`** (a dead team id resets
`viewMode` to `dashboard`; `TeamView` renders `null` for that frame).

`useWorkspaceViewGuards(showAiModels)` is the shell's whole standing-rules module, called
once from `workspace-shell.tsx` and holding three effects that used to be loose there:

1. **The open view must exist** — `!isTopLevelView(viewMode)`, `blockedTopLevelView` (a
   role-hidden screen such as the AI Models hub) or `blockedTeamView` all reset to
   `DASHBOARD_VIEW_ID`. Without it a stale `viewMode` falls through every render branch and
   strands the user on a blank card.
2. **Something is always current** — `currentAgent` picks no SCREEN any more, but provider
   routing, model prefs and the palette still read it, so the first agent adopts it when
   nothing has.
3. **One `tab_opened` point** — watching `viewMode` catches rail click, shortcut and
   programmatic redirect alike, fires on real transitions only (never the first landing),
   and skips `settings`, which emits its own. Vocabulary:
   `knowledge-base/production-infra.md`.

### The guided tour

Three files, mounted by `workspace-shell.tsx` behind `uiTourActive`:
`workspace-tour-overlay.tsx` (what renders), `workspace-tour.ts` (the step list) and
`workspace-tour-steps.ts` (the anchor vocabulary + the gates). It walks the ONE path the
product has — your teams in the rail → a team's Mission Control → starting a mission → what
the team runs on its own → the app-level destinations. Three properties, and they are the
whole design:

- **Typed step targets.** A step names an anchor from a closed union and builds its selector
  from it, never a hand-written string, so a renamed `data-tour-target` is a compile error
  instead of a spotlight that silently finds nothing. A team's section rows are addressed by
  a composed `teamId:section` selector.
- **Every step OPENS its destination on enter**, so the spotlight sits over the real surface
  rather than over the trigger that leads to it.
- **A step whose anchor cannot render is dropped**, not stalled. The gate is exhaustive over
  the anchor union, so a new anchor cannot ship without declaring whether it lives in the
  sidebar rail — which is not always on screen (auto-collapsed narrow, drawer on mobile).

`packages/web/e2e/teams-nav.spec.ts` walks the whole tour and asserts it ends on the team's
Routines section with the seeded routine visible, so a step whose surface or anchor moved
stalls the counter in CI.

### Keyboard and the ONE shell panel

`isMissionBoardView(viewMode)` (dashboard **or** team) is now the WHOLE board
predicate — there is no third board — and it makes ⌘N, the command palette, the
board arrows and bare Enter act where the user IS. Off a board, ⌘N and the
palette navigate to the board that owns the handler (`openAgentBoard(current)`)
and fire once it has registered. Everything below
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

### The two surfaces, and where a published nav lands

A mission board is really TWO boards that swap — the ACTIVE one and the
ARCHIVE — and each holds half the workspace: the active board filters
`status === "archived"` out, the archive keeps only those. Every "open this
mission" navigation (a session-finished notification, a @mention row, the
command palette, the archived → active handoff) publishes a bare mission id as
`activityPanelId`, so before anyone can open it somebody has to decide which
surface is even capable of showing it.

**That decision is made ONCE, from the RAW sweep rows, above both boards.**
`app/src/lib/board-surface-nav.ts` is the pure rule (`pendingMissionSurface`,
`surfaceOnActivate`); the rows are the shared `all-conversations` query — the
same key both boards already read, mounted by the owner as well, which costs no
second fan-out (*The one-sweep rule*). Asking a BOARD instead ("do you have this
mission?") answers "no" for half the workspace and is indistinguishable from
"this mission does not exist": an @mention on an archived mission forced the
active board on screen and opened the panel on a null session, a blank chat
whose composer silently swallowed every send.

Three pieces, and the ordering is the whole reason they are split this way:

- **`useBoardSurfaceOnNav`** (`components/board/use-board-surface-on-nav.ts`),
  mounted by the OWNER of the two surfaces (`Dashboard`,
  `team-mission-control.tsx`) — the component that survives the swap. It puts
  the named surface on screen (`show("archived") | show("active")`).
- **`usePendingMissionTarget`** takes a `surface` (which board is calling) and
  the target's `pendingSurface`, and consumes the target ONLY when they match.
  A target belonging to the OTHER surface is left published and untouched. The
  guard has to live in the consumer, not the owner: React runs child effects
  before parent effects, so the board on the glass fires a full commit before
  its owner can route anything — consuming first and asking later is exactly
  what ate the target and cleared it.
- **`useArchivedHandoff`** patches the re-activated mission's row to `running`
  in the shared sweep rows before publishing. The send already landed and the
  engine flips `archived → running` at turn start; the rows only hear on the
  turn's event, and handing off with a stale `archived` row routes the user
  straight back into the archive the mission just fell out of.

**Archive stickiness (the second half).** The old "any navigation leaves the
archive behind" invariant died with `agentBoardMode`, and a kept-alive board
comes back exactly as it was left. `useBoardSurfaceOnNav` restores it on the
false→true edge of `useIsActiveView()`: coming back onto the glass shows
`surfaceOnActivate(pending)` — the surface a published nav names, else ACTIVE.
A team change already remounts (`TeamMissionControl` is keyed on `team.id`), and
a team section change unmounts the whole section; this covers the `viewMode`
change, which unmounts nothing. In-view toggling (the toolbar's Archived button,
Back) never leaves the glass and is therefore untouched. On the global board the
same edge also drops the Mentions inbox, which is a transient sub-surface of the
same kind.

### Naming the open mission on a cross-agent board

A per-agent board knew whose mission it was showing. A cross-agent one does not: the SELECTED
CARD carries both facts (session key + agent path), and the sweep is what produces the card.
Three modules cover the beat before it does, and the warm-up before that.

| Module | What it holds |
| --- | --- |
| `components/board/use-mc-open-conversation.ts` | WHICH conversation is open plus its live feed, read off the selected card's metadata. `AIBoard` only ever reads `feedItems[activeSessionKey]`, so the single-entry map is the whole contract |
| `components/board/use-just-created-mission.ts` | The mission just created, until the sweep returns its row. Without it the panel that just opened loses its session key and agent path and eats the user's first message. Dropped the instant the real row lands — from then on the row is the truth, because it carries the status the turn stream writes |
| `lib/created-mission-handoff.ts` | The wire for a mission created OUTSIDE any board (the agent's self-setup mission, fired from a dialog by a module-level function that cannot reach a hook's setter): a module-level publisher, a hook that subscribes. The offer is **read, never claimed** — several boards are kept alive at once and a one-shot would be taken by whichever mounts first, measurably a HIDDEN one. Letting them all adopt is safe (only the board whose selection IS that mission ever reads it back out); a TTL, not a claim, keeps it from leaking into a LATER create. Dependency-free but for a clock, so `node --test` drives it directly |
| `hooks/use-warming-conversations.ts` | The optimistic warm-up rows (HOU-713) — every mission queued while some agent's engine cold-starts, shaped as a `running` conversation the sweep never returned. This is the only surface they can appear on, and "just created an agent" lands straight on a team board, which is exactly when an engine is coldest. Empty and STABLE when nothing is warming, so consumers merge unconditionally; the store's `sendsVersion` is the re-render signal, since entries mutate in place |

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

  The directory, grouped by job: **frame** — `team-routines.tsx` (the section: the list on
  the left, the selected routine's chat in the shared shell panel on the right),
  `team-routines-header.tsx` (what this list is, its count, whose rows, the one Add),
  `team-routines-footer.tsx` (the timezone every schedule on the list is read and written
  in), `team-routine-owner-chip.tsx` (whose routine — dropped once the list narrows to one
  agent). **Reads** — `use-team-routines-data.ts`, `use-team-routine-drafts.ts`,
  `use-team-trigger-statuses.ts`, all fanning out over existing per-agent keys.
  **Writes + chat** — `use-team-routine-actions.ts` (every row action already routed to its
  owner), `use-team-routine-host.tsx` + `team-routine-panel.tsx` (which owner's chat is
  open and what it was asked to show), `use-pending-team-routine-chat.ts` (consumes the
  store's `pendingRoutineChat`), `use-team-grid-labels.ts` (the section words only the
  cross-agent empty state; the grid owns the rest).
- **Files** (`team-view/team-files/`) — the opposite call: folders nest, so
  merging trees would invent a filesystem nobody has, with no honest answer to
  where an upload lands. It picks ONE agent and mounts `AgentFilesSurface`
  (`components/agent/agent-files/`), keyed on the agent, so the browser, every
  action and the failure strip are one implementation
  (`knowledge-base/files-ui.md`). This is the ONLY mount of that surface now —
  the per-agent Files tab it used to share is gone.
- **Team Settings** (`team-settings.tsx`) — the team's name, then its agents as
  rows. `TeamAgentsList` renders the SAME `PermissionsAgentGrid`
  (`components/permissions/agent-grid.tsx`) Settings > Permissions does. Opening
  a row drills into `AgentDetail`, the **same** canonical agent settings page,
  under a `BackBarScreen` labelled with the team, holding an agent **ID** rather
  than a snapshot so a share mutation keeps the page on live data.

  This section is the door EVERY deployment has onto that page (Settings >
  Permissions is the second, multiplayer owner/admin only —
  `knowledge-base/agent-settings.md`), and it is the one programmatic navigation
  uses. So it honors a one-shot deep link. `useTeamSettingsNav`
  (`team-settings-nav-store.ts`, colocated exactly like
  `permissions-nav-store.ts`) is a tiny zustand store of **two flat fields plus
  two actions** — `requestedAgentId: string | null`, `requestedSection:
  AgentSettingsSection | null`, `requestAgentDetail(agentId, section?)`,
  `clearRequested()` — not a nested request object and not part of the UI store,
  which would re-render every team surface on a navigation only one cares about.
  A caller sets the request right before `openTeamView(team, "settings")` (a turn
  summary's "the agent updated its job description" link is the live one, through
  `openAgentSettings`). The view consumes it on mount AND while already open,
  then clears it, so a later plain click on the Settings row lands back on the
  agent list. Two stores rather than one shared pin: the two views own separate
  drill-in state, and a single pin would let one swallow the other's request.

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
  `routineRunsQueryOptions(path)` (`hooks/queries/use-routines.ts`) — the same
  `queryKeys.routines(path)` / `queryKeys.routineRuns(path)` entries every other
  routines read uses. Files reads `useFiles(path)` for the one selected agent
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
  (`components/agent/trigger-status-view-model.ts`), the same one the single-agent
  activation chip runs.
- The fan-out's observers set `refetchOnWindowFocus: false` **per observer**, so the
  single-agent reader (`routine-activation-chip.tsx` → `useAgentTriggerStatus`) keeps the
  default: an alt-tab must not re-fan-out to every pod, nor fire one error toast per agent.
  The trigger fan-out deliberately builds from the query OPTIONS rather than calling
  `useAgentTriggerStatus`, because that hook carries the per-agent error toast.
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

The strip is not a team thing: it lives inside the shared `AgentFilesSurface`
too, because an empty tree and a broken tree look identical there as well.

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

- **Section rows** — one per `visibleTeamSectionsForTeam(caps, team)` entry
  (asked PER TEAM: the sidebar passes `buildTeamSidebarLists` a
  `sectionsForTeam` resolver, not one shared list), above the agent
  rows. Click → `openTeamView(teamId, section, { agentFilter: teamAgentFilter })`:
  the pin RIDES ALONG, because someone looking at Kai's missions means Kai's
  routines when they click that row next. A pin the destination team does not
  hold is dropped where it is read. **Agent rows** — click →
  `setCurrentAgent(agent)` **and** `openTeamView(team, "mission-control",
  { agentFilter: agent.id })`. **`defaultGroup`** is
  `{ name: workspaceName, sections }`, the non-collapsible trailing block.
- **Highlight** — pure, in `app/src/lib/sidebar-teams.ts`. Only
  `viewMode === TEAM_VIEW_ID` lights a team row; `resolveTeamHighlight` runs the
  stored section through **`resolveTeamSection` against the ACTIVE team's own
  `visibleTeamSectionsForTeam`** — the same list the view resolves for that same
  team (another team's would answer about the wrong door). An empty list means
  the active team no longer resolves: nothing is lit, which is honest for the
  frame before `blockedTeamView` fires, and keeps `resolveTeamSection` from
  picking from nothing. `sidebarSelectedAgentId` fills the
  filtered agent's row only while the resolved SECTION honors the pin
  (`sectionHonorsAgentPin` — not Team Settings) AND that agent is still in the
  open team. The pin is not lost under Settings; the row lights again the moment
  a section that narrows by it is opened.

## Tests

| Level | Where |
| --- | --- |
| Model (`app/tests/`) | `teams-model`, `sidebar-teams` (incl. the Settings pin gate), `team-agent-filter-model`, `team-agent-choice` (the stale-pin drop rule, all three shapes), `mission-control-scope`, `team-routines-model`, `team-routine-drafts-model`, `agent-read-failures` (counting, merging, and `allAgentReadsFailed`), `board-surface-nav` (which surface a published target belongs to, and the stickiness reset), `agent-nav` (the destination map + the settings gate), `created-mission-handoff` (adopt-many, TTL, replace-on-republish), `workspace-tour-steps` (the anchor gates) |
| Wiring | `team-one-sweep.test.ts` — roster + scope to BOTH boards, the archive's panel release, the shared agent grid |
| e2e (`packages/web/e2e/`) | `teams-nav.spec.ts` (**the destination map, walked**: the guided tour end to end onto the team's Routines, the palette's agent jump landing on that agent's team board with both rail rows lit, and a palette mission opening its chat on that board) · `support/team-nav.ts` (the ONE helper specs navigate the shell with: `openTeamSection`, `openAgentSettings`, `rail`, and `screen` — the screen ON THE GLASS, since kept-alive screens leave every other board's cards in the DOM) · `sidebar-teams.spec.ts` (what the rail SAYS) · `team-view.spec.ts` (the screen behind each row is what the rail promised: title + scope, the agent-filter round trip, the Settings drill-in, the member's rows, the archive's composed title and its panel release) · `team-routines-files.spec.ts` (aggregation with owner chips; a toggle reaching the OWNING agent's route with the id collision armed for real via `POST /__test__/routine-seq`, asserted on the request URL; the draft row's create → resume → discard round trip; the Files dropdown switching trees; the failed-agent strip via `POST /__test__/fail-agent-reads`, including a runs-only failure and the all-agents-failed copy) · `team-settings-manager.spec.ts` (the PER-TEAM Settings gate: a `role:"user"` who manages one agent gets the row on that team only, sees every agent of it, edits theirs and reads the other read-only; two teams armed by seeding the adapter's `houston.sidebar-layout.<workspaceId>` localStorage key, since a member has no "New team" affordance) · `board-keyboard-ownership.spec.ts` (only the screen on the glass owns the arrows and Enter) · `shell-panel-ownership.spec.ts` (the shared panel, including the TEAM Routines chat releasing it when the team leaves the glass and taking it back on return) · `archived-mention-nav.spec.ts` (an @mention on an ARCHIVED mission opens it on the ARCHIVE with its history, and its composer still sends and hands back to the active board) · `agent-archived-button.spec.ts` (the archive's entry/exit controls, and both stickiness resets: the team section that unmounts and the kept-alive global board that does not) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the
screen (en/es/pt).
