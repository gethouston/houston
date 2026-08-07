# Teams UI — the sidebar teams and the team view

**Not `teams.md`.** That doc is MULTIPLAYER orgs: roles, spaces, seats, sharing,
all gateway-enforced. This doc is the **client-side team surface** — how the
sidebar groups agents into teams and what the `team` screen behind each row
does. It exists single-player too, where the solo user is every team's owner.
The only thing the two share is `Capabilities`: the org role decides which team
sections a caller may open.

---

## What a team is

A team is a **named home for agents**, drawn from the workspace's stored
`sidebar_layout`:

- a **named team** IS a stored sidebar group (`SidebarGroup`);
- the **default team** is the workspace itself, wearing the workspace's name,
  holding every agent in no group.

The default team is **virtual**: nothing is written to `sidebar_layout` to make
it exist, so **there is no stored-layout migration** and no new wire shape. It
also renders when empty (it is the workspace's home team) and carries none of a
group's affordances — no caret, no rename, no delete, no shared context.

Every agent therefore belongs to **exactly one** team, and the rail has no
"loose agents" remainder.

## `app/src/lib/teams-model.ts` — the model

| Export | What it is |
| --- | --- |
| `TEAM_VIEW_ID = "team"` | The one `viewMode` every team shares (see below). |
| `DEFAULT_TEAM_ID = "team:default"` | Id of the virtual default team. |
| `TeamSectionId` | `"mission-control" \| "routines" \| "files" \| "settings"`. |
| `TeamView` | `{ id, name, agents, isDefault }` — one team, members in drag order. |
| `resolveTeams(agents, layout, workspaceName)` | Named teams in display order, then the default team. Built on `resolveSidebarSections` (`lib/agent-order.ts`), so team membership and rail order are the same resolution. |
| `teamById` / `teamOfAgent` | Lookups (`teamById` takes `string \| null`). |
| `canSeeTeamSettings(caps)` | Single-player: always. Multiplayer: org owner/admin (implicit owners of every team, C13). |
| `visibleTeamSections(caps)` | **The ONE section list.** Both the rail's section rows and the team view read it, so a section can never have a row and be unreachable, or the reverse. Today: `["mission-control", "settings"]`, or just `["mission-control"]` for a plain member. Routines and Files join it when their team-scoped surfaces land. |
| `resolveTeamSection(sections, requested)` | The section that ACTUALLY renders: the requested one when visible, else `sections[0]`. One rule absorbs every stale-store case (nothing chosen yet, a section with no surface yet, Team Settings pinned before a space switch demoted the caller). |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves (its group was deleted, or its workspace is gone). Mirrors `blockedTopLevelView`. |

`useTeams()` (`app/src/hooks/use-teams.ts`) is the **single resolution path** —
`resolveTeams` over the agent store, the cached sidebar layout and the current
workspace name, memoized. The sidebar, the team view and the workspace shell's
guard all call it, so the rail can never disagree with the screen it navigates
to. With no workspace it returns `[]`, which is exactly what `blockedTeamView`
reads to send an open team view back to the dashboard.

## Store contract (`app/src/stores/ui.ts`)

| Field | Meaning |
| --- | --- |
| `activeTeamId: string \| null` | Which team the `team` view shows. |
| `teamSection: TeamSectionId \| null` | Which of its sections. |
| `teamAgentFilter: string \| null` | **Agent ID** the team board is pinned to (`null` = the whole team). |
| `openTeamView(teamId, section, { agentFilter? })` | Sets `viewMode = "team"` + all three together, so the view is never half-set. Omitting `agentFilter` **clears** it. |
| `setTeamAgentFilter(agentId \| null)` | The board's own filter menu writing back. |

None of the three is persisted (`partialize` keeps only `sidebarCollapsed` /
`filesViewMode`), so "stale" here means within a session — typically a space
switch changing the caller's role with the view open.

## The `team` top-level view

`TEAM_VIEW_ID` is registered in `lib/top-level-views.ts` and mounted by
`topLevelScreenViews` — **one** kept-alive screen for every team, not one per
team, so renaming, reordering or deleting a team can never orphan a view id.
`TeamView` (`components/team-view/team-view.tsx`) reads `useTeams()` +
`activeTeamId` + `teamSection`, resolves the section, and keys its child on the
team id so switching teams starts clean.

Two guards, no third:

- `resolveTeamSection` — never lands on a blank pane.
- `blockedTeamView`, in `workspace-shell.tsx`'s view-reset effect — a dead team
  id resets `viewMode` to `dashboard`. `TeamView` renders `null` for the one
  frame that takes.

### Keyboard: one rule, one owner

`isMissionBoardView(viewMode)` (dashboard **or** team) is what makes ⌘N, the
command palette, the board arrows and bare Enter act where the user IS instead
of jumping out to some agent's Activity tab. Everything below follows from the
fact that **several kept-alive boards are mounted at once**, so any handler a
board publishes into the UI store is last-writer-wins.

- **Every board-handler registration is gated on `useIsActiveView()`** — not
  just `useMcNewMission`'s `onStartMission`, but `onBoardNavigate`,
  `onBoardOpen` and `onPanelClose` in `use-board-keyboard.ts` (which takes the
  composed `isActive` from `mission-board.tsx`: the screen signal AND, for the
  Activity tab, the tab's own flag). Unconditional registration let a HIDDEN
  team board keep the arrows and Enter, so Enter opened an invisible mission's
  chat into the shared shell panel. The guard is `if (!isActive) return;` with
  **no** cleanup on the inactive path: React runs the whole commit's destroy
  pass before its create pass, so the outgoing board releases and the incoming
  one claims, in that order. An `setOnX(null)` on the inactive path would
  clobber the board that just claimed.
- **`isActive` also gates the empty-board auto-open**, or an off-screen empty
  team board pops its composer over whatever the user is looking at.
- **Going inactive releases everything the board holds of the ONE shell panel**
  — the open mission, the panel claim, AND the empty new-mission composer. That
  last one lives inside `AIBoard` and is only reachable through the closer it
  hands back (`onPanelCloserReady` → `closerRef`), which is why the release
  effect lives in `use-board-keyboard.ts` next to the ref rather than in
  `mission-board.tsx`. Skipping it left `AIBoard`'s `showPanel` stuck true, so
  its open-change effect never fired again and the panel could not reopen at
  all (HOU-1165's family). `MissionControlArchived` carries its own copy of the
  same release, because it is not a `MissionBoard`.
- **⌘N and the palette check for the handler, not just the view.** Team
  Settings and an empty team are `team` views that mount no board, so
  `isMissionBoardView(viewMode)` alone fired nothing at all; both call sites
  now guard on `isMissionBoardView(viewMode) && onStartMission` and fall
  through to the per-agent path.

### Sections

- **Mission Control** (`team-mission-control.tsx`) — the team's active board,
  its archive, or `TeamMissionEmpty`. The three SWAP, as the global Mission
  Control does, so only the on-screen surface runs hooks and claims the detail
  panel. This component owns the full roster + the shared scope for both boards
  (see *The one-sweep rule*). Both also release the shared shell detail panel
  when the screen hides (HOU-1165): the active board rides `MissionBoard`'s own
  `useIsActiveView` signal, the archive carries its own release, because it is
  not a `MissionBoard`. The empty state is honest: the default team offers
  "create your first agent"; a named team says to drag one in, because a new
  agent would land in the default team.
- **Team Settings** (`team-settings.tsx`) — the team's name, then its agents as
  rows. `TeamAgentsList` renders the SAME `PermissionsAgentGrid`
  (`components/permissions/agent-grid.tsx`) Settings > Permissions does — one
  home for "a list of agents you can open", header + grid + access line — and
  keeps only its own empty state, worded to match the team's Mission Control
  empty state (`teams:teamView.settings.empty.*`). Opening a row drills into
  `AgentDetail`, the **same** canonical agent settings page, under a
  `BackBarScreen` labelled with the team. The drill-in holds an agent **ID**,
  not a snapshot, so a share mutation that reloads the agent store keeps the
  page on live data.

## The one-sweep rule

**No team surface may ever start its own cross-agent read.** Both of a team's
Mission Control boards — the ACTIVE board (`TeamMissionBoard` →
`useMissionControlSource`) and the ARCHIVE (`MissionControlArchived` →
`useMissionControlArchived`) — are handed the **full workspace roster** plus a
`MissionControlScope` (`components/board/use-mc-scope.ts`):

```ts
{ scopePaths?: string[]; title?: string; teamId?: string;
  filterPath?: string | null; onFilterPathChange?: (p: string | null) => void }
```

`team-mission-control.tsx` is the ONE owner of both: it reads the roster from
the agent store and builds the scope with `useTeamBoardScope(team)`
(`components/team-view/use-team-board-scope.ts`), then hands the same two
values to whichever surface is up. The hook is called before the empty-team
early return, because hooks may not run conditionally.

- `scopePaths === undefined` → the global board (the Dashboard passes no scope,
  so its behaviour is untouched). An **array**, empty included, → one team.
- The sweep behind each surface always spans the agents it is handed, so every
  team reads the single warm `all-conversations` query and filters it. The
  scope only narrows what the board RENDERS: `useMcScope(agents, items, scope)`
  is the ONE narrowing path, used by the active source and the archive alike.
- Handing a surface only the team's agents mints a SECOND `all-conversations`
  query key, and three real defects follow. (1) A second cross-agent fan-out
  per team — a pod-wake storm on cold agents. (2) `retargetSweepRecovery(roster)`
  sees a different roster string and cancels the pending global re-sweep timer,
  breaking HOU-981's recovery. (3) `latestCachedAllConversations` picks the
  newest successful variant of the key prefix, so a team's NARROW result can
  seed the global board as placeholder data, missing every other team's
  missions. The archive shipped with exactly this bug; it now takes the roster
  and the scope like the active board.
- Pure rules in `components/board/mission-control-scope.ts` (`inScope`,
  `agentsInScope`, `itemsInScope`, `resolveFilterPath`), unit-tested in
  `app/tests/mission-control-scope.test.ts`. `resolveFilterPath` drops a filter
  pointing outside the scope — otherwise dragging the filtered agent to another
  team would leave an empty board whose menu no longer lists what emptied it.
- `title` names BOTH boards after the team; without it a team board and the
  global one read identically. It names the BOARD, not the mode, and
  `MissionControlToolbar` composes the two: Mentions wins outright, Archived
  renders `dashboard:archived.titleForBoard` (`"{{name}} · Archived"`) when a
  title is present and the bare `archived.title` when it is not, and the active
  board is `title ?? dashboard:title`. So a team's archive says WHICH team and
  THAT it is the archive — titling it with the bare team name would have made
  it read exactly like that team's active board, which is the same confusion
  `title` exists to remove. The labelled back button carries the return path
  either way.
- `teamId` scopes the per-team concerns that are not about which cards show.
  Today that is the new-mission composer's draft:
  `missionControlDraftScope(scope?.teamId)`
  (`components/board/mission-control-scope.ts`) yields the bare
  `"mission-control"` for the global board — byte-unchanged, so stored drafts
  survive — and `"mission-control:<teamId>"` for a team's. Sharing one scope
  meant a half-typed first message parked on one team's board surfaced in every
  other team's composer. Unit-tested in `app/tests/mission-control-scope.test.ts`,
  which also asserts the source derives it instead of hardcoding the literal.
- The wiring contract is asserted over the sources in
  `app/tests/team-one-sweep.test.ts` — the roster/scope handoff, the archive
  sweeping its own `agents` prop, and the narrowing going through `useMcScope`.

### Agent id ↔ folder path

The store pins an agent **id** (the sidebar sets it by clicking a row); the board
filters on a **folder path** (the key every mission card carries), and they are
genuinely different strings. `components/team-view/team-agent-filter-model.ts`
owns both translations (`teamFilterPath` / `teamFilterAgentId`), pure and tested
in `app/tests/team-agent-filter-model.test.ts`, and wired once in
`useTeamBoardScope`. The board's filter is **controlled** by the store, so the
sidebar row and the board's own menu are the same act in both directions.

## Sidebar contract

Rail anatomy, drag-and-drop, i18n keys and the `ui/layout` props are in
[agent-manifest.md](agent-manifest.md) → *Sidebar structure*. The seam this doc
owns:

- **Section rows** — one per `visibleTeamSections(caps)` entry, above the team's
  agent rows. Click → `openTeamView(teamId, section)` (which clears the agent
  filter). A member gets no Team Settings ROW at all.
- **Agent rows** — click → `setCurrentAgent(agent)` **and**
  `openTeamView(teamOfAgent(...)?.id ?? DEFAULT_TEAM_ID, "mission-control",
  { agentFilter: agent.id })`. An agent row no longer opens the agent's own tab;
  `setCurrentAgent` still moves so the palette and ⌘[ / ⌘] keep up.
- **`defaultGroup`** — `{ name: workspaceName, sections }`, the labelled,
  non-collapsible trailing block.
- **Highlight** — pure, in `app/src/lib/sidebar-teams.ts`. Only
  `viewMode === TEAM_VIEW_ID` lights a team row. `resolveTeamHighlight` runs the
  stored section through **`resolveTeamSection` against the same
  `visibleTeamSections`** the view uses, so a fallback lights the row the user is
  actually looking at rather than nothing. `sidebarSelectedAgentId` fills the
  filtered agent's row only while that agent is still in the open team, matching
  the board's own `resolveFilterPath`.

## Tests

| Level | Where |
| --- | --- |
| Model | `app/tests/teams-model.test.ts`, `app/tests/sidebar-teams.test.ts`, `app/tests/team-agent-filter-model.test.ts`, `app/tests/mission-control-scope.test.ts` |
| Wiring | `app/tests/team-one-sweep.test.ts` — the one-sweep contract over the sources (roster + scope to BOTH boards), the archive's panel release, the shared agent grid |
| Keyboard (e2e) | `packages/web/e2e/board-keyboard-ownership.spec.ts` — only the board ON SCREEN owns the arrows and Enter, with several boards kept alive. `shell-panel-ownership.spec.ts` covers the composer half (leaving a board with the new-mission composer open must not brick the shared panel) |
| Rail (e2e) | `packages/web/e2e/sidebar-teams.spec.ts` — what the rail SAYS |
| Screen (e2e) | `packages/web/e2e/team-view.spec.ts` — that the screen behind each row is what the rail promised (title + scope, the agent-filter round trip, the Team Settings drill-in, the member with no row, the archive's composed title and its panel release) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the
screen (en/es/pt).
