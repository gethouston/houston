# Teams UI — the sidebar teams and the team view

**This is the whole shell.** An agent has no screen of its own. Every screen is a
top-level view, an agent's WORK is a slice of its team's sections, and an agent's
CONFIGURATION is the canonical settings page behind Team Settings.

Two modules own the one translation from "agent X's `<thing>`" to a team view, so a
notification, a @mention row, the command palette and a turn summary can never land three
different places:

| Module | Half |
| --- | --- |
| `lib/agent-nav.ts` | The PURE rules — `AgentNavTarget` (`board` / `routines` / `files` / `settings`), `agentDestination(teams, agentId, target)` → a `{view:"team", teamId, section, agentFilter}` (or the honest `dashboard` fallback for an agent no team claims), and `canOpenAgentSettings(caps, agent, team?)`. Unit-tested: `app/tests/agent-nav.test.ts` |
| `lib/open-agent.ts` | The IMPERATIVE half — `currentTeams()` (the same inputs `useTeams()` composes, read outside React and branched by the very same `resolveTeamsForBackend`), `openAgentBoard`, `openAgentSection("routines"\|"files")`, `openAgentSettings(agentId, section?)`. Settings is the one target that toasts rather than falling back, and it clears any armed one-shot first so a failed nav cannot fire later |

The destination MAP itself (which surface answers for which agent thing) is
`agent-manifest.md` → *Where an agent's surfaces live*; `packages/web/e2e/teams-nav.spec.ts`
drives it end to end.

**Not `teams.md`.** That doc is MULTIPLAYER orgs: roles, spaces, seats, sharing,
all gateway-enforced. This is the **client-side team surface** — how the sidebar
groups agents into teams and what the `team` screen behind each row does. It
exists single-player too, where the solo user is every team's owner. The
vocabulary trap is C13's own: **C8 calls an org a "team space"**, and the
`spaces` / `teams` capability flags plus `POST /v1/orgs` all mean THAT. The teams
in this document are a **second, finer grouping INSIDE** one space. Confusing the
two is how someone ends up gating agent access on a team.

**The wire contract of record is `cloud/docs/contracts/C13-agent-teams.md`**
(routes, error codes, the server-side effective-value rules). This doc is the
CLIENT half. When they disagree, C13 is right.

## What a team is — the LOCAL backend

With `capabilities.agentTeams` absent or false — desktop, self-host, and every
gateway that predates C13 — a team is a **named home for agents**, drawn from the
workspace's stored `sidebar_layout`: a **named team** IS a stored sidebar group
(`SidebarGroup`); the **default team** is the workspace itself, wearing the
workspace's name and holding every agent in no group. The default team is
**virtual** — nothing is written to `sidebar_layout` to make it exist, so there is
no stored-layout migration and no new wire shape. It renders when empty and
carries none of a group's affordances (no caret, rename or delete). Every agent
therefore belongs to **exactly one** team, and the rail has no "loose agents"
remainder.

That is the whole model off-capability, and it is the half the section below must
never disturb.

## Two backends, one seam

`capabilities.agentTeams` is a **feature-detect**, not a feature flag: the
gateway describing whether it serves C13 teams. ON, teams and their rosters are
the SERVER's (`GET /v1/org/teams`). OFF, everything above holds unchanged — the
off-capability path is **byte-identical**, and every rule below is written so
that its off-capability branch is literally the code that shipped before C13.

**`useTeams()` (`app/src/hooks/use-teams.ts`) is THE seam** — the one place the
branch is taken, and the one resolution path the sidebar, the team view and the
workspace shell's guard all read, so the rail can never disagree with the screen
it navigates to. The capability itself is read through ONE predicate,
`hasAgentTeams(caps)` (`lib/org-roles.ts`), so no surface can spell the
feature-detect its own way. The branch is a PURE function,
`resolveTeamsForBackend`, which lives in `lib/teams-backend.ts` (not in the hook
module: `lib/open-agent.ts` needed it, and a lib reaching into `hooks/` for a
pure function is the wrong direction) and is shared with that module's store-free
`currentTeams()` (which reads the same two caches: `getCurrentAgentTeams()` and
`queryClient.getQueryData(queryKeys.capabilities())`). Two copies of that rule
would let the rail and a keyboard shortcut resolve different teams for the same
agent, which is exactly the class of bug the one-seam design exists to make
impossible.

### The merge rules

Server-backed, `resolveServerTeams(serverTeams, agents, layout)`
(`app/src/lib/server-teams-model.ts`, pure) merges three inputs — the server's
teams, the local agent store, and the ordering overlay — into the `TeamView[]`
everything renders. Seven rules, and each exists because dropping it breaks
something specific:

1. **Server order wins.** Teams come out in the server's array order (the gateway
   already sorts by `(sortOrder, createdAt, id)`). The overlay never reorders
   TEAMS, only agents inside one.
2. **Membership is the server's.** Each team's `agentSlugs` is matched against
   the agent store by `Agent.id` — on the gateway an agent's **id IS its slug**. A
   slug with no agent row is DROPPED silently: the roster read is the authority
   on what can render, and inventing a row for a slug we have no agent for would
   put a nameless entry in the rail. A slug repeated inside one team renders once.
3. **Order inside a team is the overlay's.** The overlay group whose `id` equals
   the team id supplies `agentIds`: members it names come first, in that order,
   then every remaining member in server `agentSlugs` order. Overlay ids this team
   does not hold are ignored rather than treated as an error — that is just a
   stale drag order after someone else moved the agent.
4. **Leftovers land in the default team.** An agent in the store that NO server
   team claims is appended to the `isDefault` team, in agent-store order. The
   roster read and the teams read are two separate requests: a just-created agent
   is in one before the other, and the rail must never lose an agent. If the
   response carried no default team, leftovers are dropped — the client never
   invents a team.
5. **Server facts are copied verbatim.** `{joined, owner, memberCount, sortOrder}`
   land on `TeamView.server` exactly as sent. They are the caller's EFFECTIVE
   values, already resolved server-side, and the client re-deriving any of them
   would get them wrong: an org owner/admin reads `owner: true` on every team,
   everyone reads `joined: true` on the default one, and the default team's
   `memberCount` is the whole space's rather than a row count.
6. **The joined/other split** is `partitionTeams`, on `server?.joined !== false`,
   preserving order. With no `server` facts at all — the local backend —
   EVERYTHING is joined, so the split is a no-op and the caller's off-capability
   path is unchanged.
7. **The overlay is ADJUSTED on write, never pruned.**
   `normalizeTeamOverlay(layout, serverTeams)` is what gets persisted after an
   overlay write. It may only touch the rows that name a LIVE server team, and
   there it does two things: narrow `agentIds` to the agents that team actually
   holds (so a stale drag order decays on the next write instead of
   accumulating), and fill a BLANK name from the server's own — a row upserted
   by a first collapse or a first drop is born nameless
   (`blankOverlayGroup`), which is invisible while the capability is on and a
   nameless block the moment it goes away. Every OTHER stored group is carried
   through **untouched, in place**. Deleting them looks reasonable until you
   count the hosts where it fires: a personal space serves exactly ONE team, so
   every local group the user ever built is "not live", and one drag used to
   persist their names, shared context and membership away for good (that is
   what makes *The one user-visible consequence* below actually true). The price
   is that a team someone else deleted keeps an inert, invisible row in a
   per-user preference, which cannot cost anyone their work. Normalizing on
   write rather than on read is deliberate: a read-side pass would touch a
   user's drag order during any window where the teams read is empty or in
   flight.

### The overlay

Server-backed, the stored `sidebar_layout` stops being the model and degrades to
a per-user **ORDERING OVERLAY**, keyed by SERVER team id. Only three of its
fields are ever read there: `id`, `collapsed`, and `agentIds`. **`name` and
`context` are inert** — the server names its teams, and nothing reads a group's
shared context on a server host, which is why the rail's header menu withholds
the context editor rather than offering an editor that promises an effect the
agents would never see. `normalizeTeamOverlay` leaves `context` and `collapsed`
exactly as they were, so a preference the user set on the local backend is not
churned, and it only ever WRITES a `name` into a row that has none, which is the
one case where leaving the inert field alone would cost something (see rule 7).

### The honest empty state

Server-backed with the first read still in flight, `resolveTeamsForBackend`
resolves to **no teams**. That is the honest answer and it is deliberately NOT a
fallback to the local groups: those groups describe a grouping this host does not
have, and rendering them would show the user a rail that one refresh later
rearranges itself. TanStack keeps the last good data across refetches and errors,
so this is a first-load-only state, and it is exactly what `blockedTeamView`
reads. Nothing in the read path degrades a 404 either (`ui/engine-client`'s C13
block and the adapter mixin both throw): the caller feature-detected first, so a
404 can only mean the host advertised the surface and then denied it, and
swallowing it would present "you have no teams" as the truth.

### The one user-visible consequence

On a gateway that advertises `agentTeams`, **a personal space serves exactly one
team** (the default one; every mutation answers `403 personal_space`). So a user
who had built LOCAL sidebar groups in that space sees them **stop grouping**: the
overlay preserves their agent ORDER, not their grouping, because the server is
now the authority on which team holds which agent and it says "all of them, the
default one". This is written down here so it is found rather than rediscovered
as a bug. The local groups are not destroyed — they sit in the overlay, names,
shared context and membership intact, and come back if the capability ever goes
away — they simply do not draw blocks any more. That is rule 7's job and it is
pinned by `server-teams-model.test.ts` ("a personal space's single team does not
erase the user's local groups", plus the collapse-toggle and group-reorder
writes that used to erase them too).

### Writes: the expected-error taxonomy

Six of the gateway's rejections are **business states, not Houston bugs**:
`default_team`, `personal_space`, `not_team_owner`, `invalid_team_id`,
`not_a_member`, `invalid_name`. Everything else it can answer
(`team_not_found`, `invalid_sort_order`, `invalid_owner`) means the client sent
something it should never have sent, so it must reach us as a bug report.

`invalid_name` is the newcomer, and the odd one out: it is the only refusal a
user can provoke by TYPING. The real fix is the ceiling itself —
`TEAM_NAME_MAX_RUNES = 60` (`team-members-model.ts`) is the gateway's own
`1..60 RUNES after trimming`, counted the same way (`[...name].length`; a
`maxLength` attribute counts UTF-16 units and would cut `"🙂".repeat(60)`, a name
the gateway ACCEPTS, in half). `clampToRunes` caps the Team Settings field and,
through `AppSidebar`'s `groupNameMaxRunes`, the rail's inline rename and the
create draft that commits through it; paste is clamped, never blocked. Treating
the code as expected as WELL is belt and braces: if a name ever does get past
the inputs the user reads a calm sentence rather than a red report-a-bug pair.

`app/src/lib/agent-team-errors.ts` is the pure classifier
(`agentTeamErrorCode` — reusing `shareErrorCode`, which already reads the FLAT
`{error, code}` shape the Go edge answers with — plus `isExpectedAgentTeamError`
and `agentTeamErrorCopy`, which returns i18n KEYS so the copy map unit-tests
without a DOM). `app/src/hooks/queries/agent-team-write.ts` is the ONE surface:
every agent-teams mutation passes the shared `SILENCE_EXPECTED` constant into its
`tauriAgentTeams.*` call and carries `surfaceExpectedAgentTeamError` as its
`onError`. **Exactly one surface either way** — expected becomes an informational
toast in the user's own words, unexpected falls through to `call()`'s red
report-a-bug pair. One constant and one function, in one module, so no mutation
can end up wired half-way.

**This is deliberately NOT a branch in `surfaceError` (`lib/tauri.ts`).**
`personal_space` already means something else there (the invite flow), and the
error alone cannot tell the two apart — only the call site can.

### Reactivity

**Every team mutation fans out the same `AgentsChanged` event the client already
reacts to** — a team created, renamed or deleted, someone joining or leaving, an
agent moved between teams. So no team write needs a refresh signal of its own.
`app/src/lib/agent-invalidation-plan.ts`'s `AgentsChanged` case pushes
`queryKeys.agentTeams()` and the whole `["agent-team-members"]` PREFIX (the event
names no team, so the open team's member list is refreshed by prefix), inside the
SAME `workspaceId` guard the roster reload already uses: on an `agentTeams` host
the teams ARE this workspace's grouping, and another workspace's event must not
disturb it. Without this the roster would reload and the rail would keep showing
the previous grouping until the next mount.

The reads themselves are `app/src/hooks/queries/use-agent-teams.ts`:
`agentTeamsQueryOptions` (key `agentTeams()`, `staleTime` 30s),
`useAgentTeams(enabled)` where `enabled` IS the capability,
`useAgentTeamMembers(teamId, enabled)`, `getCurrentAgentTeams()` for the
store-free reader, and every write hook. `useMoveAgentToTeam` is the one
OPTIMISTIC write: it cancels the teams query, snapshots it, applies the pure
`moveAgentInTeams` patch, and restores the snapshot on refusal — the drop already
animated the agent into its new block, so the cache must agree before the round
trip or the rail snaps back for the length of the request.

## `app/src/lib/teams-model.ts` — the model

| Export | What it is |
| --- | --- |
| `TEAM_VIEW_ID = "team"` | The one `viewMode` every team shares. |
| `DEFAULT_TEAM_ID = "team:default"` | Id of the virtual default team, LOCAL backend only. Server-backed the default team wears a real server id like any other, so nothing may assume this sentinel when resolving a drop target. |
| `TeamSectionId` | `"mission-control" \| "routines" \| "files" \| "settings"`. |
| `TeamView` | `{ id, name, agents, isDefault, server? }` — one team, members in drag order. |
| `ServerTeamFacts` | `{ joined, owner, memberCount, sortOrder }`, the caller's EFFECTIVE standing in one team, copied verbatim off the wire. Present ONLY on an `agentTeams` host: its **absence** is what keeps every rule in this table byte-identical on the local backend, so "is this team server-owned?" is asked everywhere as `team.server !== undefined`. |
| `resolveTeams(agents, layout, workspaceName)` | The LOCAL backend: named teams in display order, then the default team. Built on `resolveSidebarSections` (`lib/agent-order.ts`), so team membership and rail order are one resolution. |
| `teamById` / `teamOfAgent` | Lookups (`teamById` takes `string \| null`). |
| `canSeeTeamSettings(caps)` | The ORG-WIDE half of the Settings gate, and the only gate here that predates C13 (it reads caps, not a team). Single-player: always. Multiplayer: org owner/admin. Read only on the LOCAL backend now — a server-teams host replaces this half with the server's own per-team `owner`. Lives in `lib/team-permissions.ts`, re-exported here. |
| `visibleTeamSectionsForTeam(caps, team)` | **The ONE section list**, read by both the rail's rows and the view FOR THE SAME TEAM, so a section can never have a row and be unreachable (or the reverse). `["mission-control","routines","files"]` for everyone, `+ "settings"` when `(team.server ? team.server.owner : canSeeTeamSettings(caps)) \|\| team.agents.some(a => isAgentManager(caps, a))`. On a server-teams host the server's own `owner` for THAT team replaces the client-derived org-role half: it already folds in the org owner/admin (implicit owner of every team) and adds the EXPLICIT team owner, who configures their team without being an org admin. The agent-manager clause is untouched on both backends, so a member who manages one of the team's agents still gets in. Only Settings is gated because the other three show the team's WORK, and a member who may use the team's agents may see what they do on their own and what they keep; Settings is the only one that CONFIGURES. It is **per team**, not per caller: the same person configures one team and only uses the next, so the rail asks again for every block it draws. |
| `resolveTeamSection(sections, requested)` | What ACTUALLY renders: the requested section when visible, else `sections[0]`. One rule absorbs every stale-store case. |
| `sectionHonorsAgentPin(section)` | Whether the OPEN section narrows by `teamAgentFilter`. True for Mission Control / Routines / Files, false for Settings, which lists the whole team whatever the pin says. The rail's agent-row fill reads it. |
| `blockedTeamView(viewMode, teams, activeTeamId)` | The open team no longer resolves — and ONLY that. Mirrors `blockedTopLevelView`. It deliberately does NOT ask whether the caller joined: **joining is sidebar pinning and it grants nothing**, so every team `useTeams()` resolves is one the gateway already lets this caller see, and bouncing an unjoined one turned a palette or @mention jump to its agent into a silent dead end on the dashboard. See *Unjoined teams are viewable* below. |
| `canRenameTeam` / `canDeleteTeam` / `canLeaveTeam` / `canJoinTeam` | The "may I do this to a team?" gates, `lib/team-permissions.ts`, re-exported from `teams-model` so it stays the one door onto a team's rules. Each answers twice, once per backend. Rename: locally any named group (never the virtual default, which wears the workspace's name); server-side the team OWNER, and the default team IS renamable there. Delete: never the default on either backend, plus owner-only server-side. Leave: server-only (`server.joined && !isDefault` — locally there is no membership to give up, and everyone is in the default team by definition). Join: server-only, `server.joined === false`. Affordance gates ONLY; the gateway is the sole enforcer and every one of these refusals is also an expected state (see the taxonomy above). |
| `resolveServerTeams` / `partitionTeams` / `normalizeTeamOverlay` | The SERVER backend, in its own pure module `lib/server-teams-model.ts` — the seven merge rules above. |

`useTeams()` (`app/src/hooks/use-teams.ts`) is the **single resolution path**, and
`resolveTeamsForBackend` (`lib/teams-backend.ts`) is its pure core (see *Two
backends, one seam*). It
composes the capability, the server's teams, the agent store, the cached sidebar
layout and the workspace name, memoized because consumers derive memoized
structures from the result. The sidebar, the team view and the workspace shell's
guard all call it, so the rail can never disagree with the screen it navigates
to. Off-capability with no workspace it returns `[]`; server-backed with the
first read in flight it also returns `[]` — both are what `blockedTeamView`
reads.

`canOpenAgentSettings(caps, agent, team?)` (`lib/agent-nav.ts`) takes an OPTIONAL
third argument so a caller that already resolved the agent's team asks the SAME
question the rail asks (`visibleTeamSectionsForTeam(...).includes("settings")`).
Omitted (or `null`), it falls back to the org-wide answer, which is never WIDER
than the per-team one — needed because a server-host explicit team owner may
configure a team's agents without being an org admin, and only the per-team gate
knows that. The live caller is `turn-file-summary.tsx`, which resolves the
agent's team with `teamOfAgent(useTeams(), …)` and passes it: with two arguments
that owner read "the agent updated its job description" as plain text instead of
the link into the page they are entitled to configure.

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
`blockedTeamView`, in **`shell/use-workspace-view-guards.ts`** (a dead team id
resets `viewMode` to `dashboard`; `TeamView` renders `null` for that frame). A
team the caller has not JOINED is not blocked — it renders, see *Unjoined teams
are viewable*.

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

  **On a server-teams host the page grows two surfaces a team owns beyond its
  agents**, both hung off `team.server !== undefined` so the page stays
  byte-identical on the local backend (where the header is the read-only
  `PageHeader title={team.name}` it has always been).

  - **The team's name**, editable in place (`team-name-field.tsx`), when
    `canRenameTeam(team)`. This is the DEFAULT team's only rename door: its rail
    block deliberately carries no menu (it stands for the container every agent
    falls back into), yet its name is what every member reads at the top of the
    rail. The field is seeded with the saved name and REMOUNTED by its `key` when
    that name changes, so it re-syncs to server truth without an effect that could
    overwrite what the user is mid-way through typing. Save is disabled until
    `teamNameCommit(draft, saved)` says the write would change something, so the
    button never promises a write the gateway would refuse with `invalid_name`.
  - **The Members card** (`team-members-card.tsx`, pure half in
    `team-members-model.ts`): the team's **EXPLICIT membership rows only**, from
    `useAgentTeamMembers`. Which is why it always ships the **effective note** —
    the space's owners and admins run every team without ever holding a row
    (C13 resolves implicit ownership, never stores it), so a roster read on its
    own would claim a team nobody is in charge of. Writes are **owner-gated**
    (`team.server.owner`): an owner-flag toggle and a remove, both absent
    otherwise, and never on the caller's OWN row — demoting or removing yourself
    is the same wire call as leaving, and the card already offers Leave as one
    deliberate action named for what it does. The **default team is READ-ONLY per
    the wire** (every member write on it answers `400 default_team`, and it holds
    no explicit rows at all), so it renders its note INSTEAD of a roster and never
    fires the membership read. There is no Join counterpart here even though an
    unjoined team's screen DOES render: joining is sidebar pinning and grants
    nothing, this card's writes are owner-gated either way, and keeping the act
    in one place — the rail's Other teams block, which Leave puts a team
    straight back into — is what makes it one deliberate click rather than two
    doors. A failed read says it failed rather than rendering as an empty team.

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
  `{ name: <the isDefault team's name>, sections }`, the non-collapsible trailing
  block — the workspace's name locally, the server's own name for its default
  team on an `agentTeams` host. It carries no header menu on either backend,
  which is why Team Settings is the only place its name can be edited.
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

### Server-backed rail semantics

Off-capability none of this fires: `partitionTeams` is a no-op, the affordance
mask is `undefined` (which the library reads as "every affordance the host wired
a callback for" — the pre-C13 rendering), and every write goes to the stored
layout exactly as before.

- **"Your teams" means JOINED.** `sidebar.tsx` splits `useTeams()` with
  `partitionTeams` and hands `buildTeamSidebarLists` only `joined`. Its `agents`
  input is narrowed the same way, by `agentsInTeams(agents, joined)`
  (`team-sidebar-model.ts`): the grouped list drops every item no group claims
  into the trailing default block, so handing it the whole store while drawing
  only the joined teams would spill an unjoined team's agents into the default
  team's leftovers. The helper returns the SAME array when nothing is excluded,
  so the local backend is untouched down to object identity.
- **"Other teams"** (`other-teams-block.tsx`) is a collapsed-by-default disclosure
  in `AppSidebar`'s `footer` slot, above the user menu, expanded-rail only (the
  rows need a name, a member count and a Join button, none of which fit the icon
  rail). One row per unjoined team, each with an always-visible Join. It is
  APP-level, not a new `ui/layout` slot: the library knows about groups, not about
  membership in a shared space.
- **Unjoined teams are VIEWABLE.** The rail files them under "Other teams" and
  keeps their agents out of the blocks above, but the SCREEN behind such a team
  renders like any other: Mission Control, Routines and Files all read the team
  they are handed and ask nothing about membership, and `blockedTeamView` no
  longer bounces them. That is the only reading consistent with the rule below —
  if joining granted nothing, refusing to draw the screen was inventing a gate
  the gateway does not have, and it made the command palette's jump to an agent
  living in an unjoined team land silently on the dashboard
  (`teams-nav.spec.ts` walks exactly that jump). **Team Settings is unchanged**:
  it is still gated by `visibleTeamSectionsForTeam`, i.e. the server's per-team
  `owner` or managing one of the team's agents, so the extra reach is the team's
  WORK, never its configuration. No Join button was added to the team view: the
  four sections own their own chrome and none has a trailing-action slot, so it
  would have meant inventing layout in three places for an act the rail already
  offers one click away. Nothing lights in the rail while an unjoined team is
  open, which is honest — it is not one of "Your teams".
- **JOINING IS SIDEBAR-PINNING AND IT GRANTS NOTHING.** This is C13's first
  non-negotiable and the single thing a future reader must not "improve": every
  team listed is one the gateway ALREADY lets this caller see, and joining only
  moves it up into "Your teams". No agent, file or permission changes hands.
  Agent access is per-agent assignments and only that; making a team gate access
  is a contract break. It is also why Join can sit in the open with no
  confirmation — the worst outcome is a team in your sidebar you did not want,
  and Leave puts it straight back.
- **Leave** is the last item of the team header menu, below a separator, because
  it acts on the CALLER's membership rather than on the group. In `ui/layout` it
  is the one **opt-in** affordance: `groupAllows` treats the mask as a veto for
  rename/delete/context, but `leave` shows only on an explicit `true`, so a host
  with no notion of joining a group can never acquire a way out of one by staying
  silent. The app withholds it when there is no session id, since there would be
  no `:userId` to send.
- **Creation is name-first.** Locally a group is minted immediately with a
  placeholder ("New team") and renamed in place, which is harmless — the layout is
  the user's own. In a shared space that placeholder would be BROADCAST to
  everyone the instant it is clicked. So a server host mints nothing: "New team"
  appends a LOCAL draft row (`DRAFT_TEAM_ID = "team:draft"`, empty name, no
  sections, no affordances) that only this user sees, opens it straight into
  inline rename, and POSTs `createAgentTeam(name)` on commit. The draft is never a
  drop target. An abandoned rename (Escape, or a blur with an empty or unchanged
  value) retires it through `onCancelRenameGroup` — without that signal a host
  cannot tell an abandoned name from a pending one and the phantom row stays on
  screen forever. Creating a team is not an admin power server-side: any member of
  the space may add one.
- **Drag across teams is a server write.** `onMoveItem(agentId, dest)` resolves the
  target as `dest.groupId ?? <the isDefault team's id>` (a real server id there,
  never the local `DEFAULT_TEAM_ID` sentinel) and, when it differs from
  `teamOfAgent(...)`, fires `useMoveAgentToTeam` → `PUT /v1/agents/:slug/team`,
  optimistic with rollback. **Within-team reorder is overlay-only**: nothing moved
  teams, so there is nothing to tell the server. The overlay write recording the
  drop POSITION happens on both backends and in both cases.

  A cross-team drop is therefore TWO optimistic writes that must AGREE, and the
  order they are composed in is load-bearing. `crossTeamDropOverlay`
  (`lib/agent-team-patches.ts`, pure) normalizes the overlay against
  `moveAgentInTeams(teams, …)` — the roster the move ASSERTS — not the one still
  cached: pruned against the roster as it stands, the destination team does not
  hold the dropped agent yet, rule 7 deletes the id the drop just wrote, and the
  position is silently lost (the agent reappears appended). Sequencing the two
  writes instead does not fix it — React Query runs `onMutate` a microtask after
  `mutate()`, so a synchronous overlay write that follows it still reads the
  pre-move roster. The layout the write REPLACED travels with the mutation, and
  a refusal (`not_team_owner`) restores BOTH caches, so a refused drag cannot
  leave the source block's order rearranged.
- **Reordering a team block is a `sortOrder` write.** Server-backed, team order
  is the server's (rule 1) and the overlay has no say in it, so the header drag
  routes through the team actions too: `teamSortOrderBetween` picks the MIDPOINT
  of the two teams the block landed between (`first - 1` at the top, `last + 1`
  at the bottom — one `PATCH`, rather than renumbering the list with one request
  per team, which would stop halfway at the first team the caller does not own),
  and `applyTeamSortOrder` patches the cached teams and re-sorts them the way
  the gateway will. Both are pure, in `lib/agent-team-patches.ts`. The patch is
  applied SYNCHRONOUSLY at the call site rather than from `onMutate`, because a
  group drag releases its working copy the instant it ends and a patch landing a
  microtask later lets the block snap back for a frame. Before this the handle
  was wired straight to the stored layout: a silent no-op that still persisted
  something. The one position it cannot express is between two teams that
  already share a `sortOrder`; neither the gateway nor the fake host mints
  duplicates, so that is corrupted data, not a flow.
- The rail's own file split follows the same line: `sidebar.tsx` composes what
  the rail KNOWS, `sidebar-rail.tsx` is the single `AppSidebar` invocation it
  renders twice (fixed rail, mobile drawer) from one `SidebarRailModel`.
- Every one of these writes lives in `use-server-team-actions.ts` rather than in
  `sidebar.tsx`, and each branches on `serverBacked` EXACTLY ONCE, so the two
  backends cannot diverge halfway. The two DRAG writes are one module further
  down, `use-team-drag-writes.ts`, because they are the only ones that patch a
  cache optimistically and must undo it — same shape twice: snapshot, patch,
  fire, restore on refusal. The menu writes add no `onError` (the mutation hooks
  own that surface); the two optimistic ones add exactly one, for their own
  rollback.

## Tests

| Level | Where |
| --- | --- |
| Model (`app/tests/`) | `teams-model` (incl. the server-truth Settings gate and the not-joined block), `server-teams-model` (**all seven merge rules by number**, plus no-default-team leftovers, an overlay naming an agent the team lost, a repeated slug, and a corrupt stored overlay), `agent-team-errors` (the flat gateway body, every expected code, and the codes that must stay bug reports), `team-members-model` (row shaping and order, the never-editable self row, the read-only decision per face, Leave's user id, `teamNameCommit`), `team-sidebar-model` (`agentsInTeams`, incl. the same-array identity return the local backend depends on), `agent-team-patches` (the pure patches an optimistic write applies: the move, the cross-team drop's overlay pruned against the roster the move ASSERTS and leaving its inputs intact for the rollback, the `sortOrder` midpoint and the reorder re-sort), `sidebar-teams` (incl. the Settings pin gate), `team-agent-filter-model`, `team-agent-choice` (the stale-pin drop rule, all three shapes), `mission-control-scope`, `team-routines-model`, `team-routine-drafts-model`, `agent-read-failures` (counting, merging, and `allAgentReadsFailed`), `board-surface-nav` (which surface a published target belongs to, and the stickiness reset), `agent-nav` (the destination map + the settings gate, incl. the optional team argument), `agent-invalidation-plan` (`AgentsChanged` reaching the teams + member-prefix keys inside the workspace guard), `created-mission-handoff` (adopt-many, TTL, replace-on-republish), `workspace-tour-steps` (the anchor gates) |
| Wire | `ui/engine-client/tests/client-agent-teams.test.ts` (all nine methods' `{method, url, body}` and parse side, id encoding, and **"a 404 throws, it is NOT degraded"** for every one) · `packages/web/tests/agent-teams-urls.test.ts` (the adapter's whole URL strings, and a slash/percent-bearing id staying inside its own path segment) · `ui/layout/tests/sidebar-groups.test.ts` (the affordance mask: veto for rename/delete/context, opt-in for `leave`) · `ui/layout/tests/rune-clamp.test.ts` (the rename input's ceiling counts code POINTS and never splits a surrogate pair) |
| Fake host | `packages/fake-host/src/server.test.ts` → *agent teams (C13)*, the only place the client's assumptions meet a server: each test pins a rule of the contract rather than an implementation detail (the EFFECTIVE `joined`/`owner`/`memberCount`, the role filter on `agentSlugs`, every refusal code, the `AgentsChanged` fan-out). Arm it with `POST /__test__/agent-teams` `{teams?, personalSpace?}` (`packages/fake-host/README.md`), paired with `POST /__test__/capabilities {agentTeams: true}` since the client feature-detects |
| Wiring | `team-one-sweep.test.ts` — roster + scope to BOTH boards, the archive's panel release, the shared agent grid |
| e2e (`packages/web/e2e/`) | `teams-nav.spec.ts` (**the destination map, walked**: the guided tour end to end onto the team's Routines, the palette's agent jump landing on that agent's team board with both rail rows lit, a palette mission opening its chat on that board, and the same jump reaching an agent that lives in a team the caller never JOINED — which must land on that team's board, not the dashboard) · `support/team-nav.ts` (the ONE helper specs navigate the shell with: `openTeamSection`, `openAgentSettings`, `rail`, and `screen` — the screen ON THE GLASS, since kept-alive screens leave every other board's cards in the DOM) · `sidebar-teams.spec.ts` (what the rail SAYS) · `team-view.spec.ts` (the screen behind each row is what the rail promised: title + scope, the agent-filter round trip, the Settings drill-in, the member's rows, the archive's composed title and its panel release) · `team-routines-files.spec.ts` (aggregation with owner chips; a toggle reaching the OWNING agent's route with the id collision armed for real via `POST /__test__/routine-seq`, asserted on the request URL; the draft row's create → resume → discard round trip; the Files dropdown switching trees; the failed-agent strip via `POST /__test__/fail-agent-reads`, including a runs-only failure and the all-agents-failed copy) · `team-settings-manager.spec.ts` (the PER-TEAM Settings gate: a `role:"user"` who manages one agent gets the row on that team only, sees every agent of it, edits theirs and reads the other read-only; two teams armed by seeding the adapter's `houston.sidebar-layout.<workspaceId>` localStorage key, since a member has no "New team" affordance — and it must keep passing UNCHANGED, which is the standing proof that the capability-off path is byte-identical) · `agent-teams.spec.ts` (the SERVER backend, armed with `POST /__test__/capabilities {agentTeams:true}` before `page.goto`: the joined/other split with one-click Join, creation sending the TYPED name, a cross-team drag moving the agent on the server and a refusal putting it back, the Members card's owner toggle, the default team's read-only list saying why, the per-team Settings gate for a joined member who manages nothing, a cross-team drop landing WHERE it was dropped and surviving a reload, a refused drag putting the SOURCE block's order back exactly (armed by seeding the overlay in `houston.sidebar-layout.<workspaceId>`), and a team-header drag `PATCH`ing `sortOrder` without touching the overlay and holding across a reload) · `board-keyboard-ownership.spec.ts` (only the screen on the glass owns the arrows and Enter) · `shell-panel-ownership.spec.ts` (the shared panel, including the TEAM Routines chat releasing it when the team leaves the glass and taking it back on return) · `archived-mention-nav.spec.ts` (an @mention on an ARCHIVED mission opens it on the ARCHIVE with its history, and its composer still sends and hands back to the active board) · `agent-archived-button.spec.ts` (the archive's entry/exit controls, and both stickiness resets: the team section that unmounts and the kept-alive global board that does not) |

i18n: `shell:sidebar.teamSections.*` for the rows, `teams:teamView.*` for the
screen, `teams:agentTeams.*` for everything the server backend adds (Other teams,
Join/Leave, the member count plural, the Settings name field and Members card,
and the five expected-error title/body pairs), plus `shell:sidebar.teams.leave`
for the rail menu label (en/es/pt).
