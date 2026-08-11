# Agent definitions (manifest, creation, activation)

What an AI agent IS on disk and how one comes into existence: the manifest shape,
where definitions live, how one is created / imported / activated, and the map of
where an agent's surfaces live now that agents have no screen of their own.

Related: [providers.md](providers.md) (which model it runs on) ·
[agent-settings.md](agent-settings.md) (the per-agent settings page) ·
[teams-ui.md](teams-ui.md) (the sidebar teams rail + the `team` screen) ·
[agent-store.md](agent-store.md) (the public catalog).

## Two tiers

1. **Built-in** — baked into the app bundle: `personalAssistantAgent` (the default
   for new workspaces), `blankAgent` (start-from-scratch), plus the first-party
   store templates. `app/src/agents/builtin/index.ts` composes
   `[personalAssistant, blank, ...storeCatalogConfigs]`.
2. **Installed** — `houston.json` templates the user added from a GitHub repo,
   merged alongside the built-ins by the create-agent picker.

An installed definition with the same id as a built-in **overrides** it (dedup in
`app/src/stores/agent-configs.ts`).

## Manifest shape

`AgentConfig` (`app/src/lib/types.ts`):

```ts
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;           // Lucide icon name (fallback when no image)
  image?: string;          // store-card art
  color?: string;          // brand override
  category?: AgentCategory;
  author?: string;         // "Houston" for first-party
  tags?: string[];
  integrations?: string[]; // Composio toolkit slugs → the connected-apps chips row
  claudeMd?: string;       // CLAUDE.md template content
  systemPrompt?: string;
  agentSeeds?: Record<string, string>; // files seeded into new agents
  features?: string[];     // vestigial (was Rust feature flags); nothing reads it
}
```

A resolved definition is `AgentDefinition { config, source: "builtin" | "installed",
path? }`. An agent INSTANCE is `Agent { id, name, folderPath, configId, color?,
createdAt, localDir?, assigned? }` — `localDir` is present only when the engine is
co-located with the files (TS host, local profile); `folderPath` is a route key on
the TS engine, not a path. `assigned` is multiplayer-only.

## Where an agent's surfaces live (there are no agent tabs)

**An agent has no screen of its own.** The seven-tab agent shell (Activity /
Context / Skills / Integrations / Routines / Files / Admin) was deleted in the
teams cutover along with `app/src/agents/standard-tabs.ts`, `tab-resolver.ts`,
`components/shell/experience-renderer.tsx` and the seven wrappers under
`components/agent/`. Every screen is a top-level view
(`app/src/lib/top-level-views.ts`), and an agent is reached THROUGH one:

| What the user wants | Where it is now |
| --- | --- |
| this agent's missions | its TEAM's **Mission Control**, filtered to it (`teamAgentFilter`) |
| what it runs on its own | its team's **Routines** section, filtered to it |
| the files it keeps | its team's **Files** section, with it selected |
| job description / memory / people / apps / models / skills | the canonical **agent settings page** (`components/agent-settings/agent-settings-page.tsx`), via **Team Settings → the agent's row** |
| connecting apps | the global **Integrations** page (connections are the caller's, not an agent's) |

- **`TOP_LEVEL_VIEWS` is SEVEN**: `inbox`, `settings`, `ai-hub`,
  `integrations-home`, `skills-home`, `agent-store`, `team`. Both `sidebar.tsx`
  and `workspace-shell.tsx` source from that one set. Time worked / Permissions /
  Admin are NOT in it — they are settings sections
  (`app/src/lib/settings-sections.ts`, HOU-788).
- `lib/agent-nav.ts` is the ONE translation from "take me to agent X's <thing>"
  into the team view the store opens (`agentDestination`, pure + unit-tested in
  `app/tests/agent-nav.test.ts`). `lib/open-agent.ts` is its imperative half
  (`openAgentBoard` / `openAgentSection` / `openAgentSettings`), used by @mention
  rows, session notifications, the command palette, ⌘[ / ⌘], the UI tour, agent
  creation and import. Nothing composes `openTeamView` for an agent by hand.
- `currentAgent` (the agents store) SURVIVES — provider routing, model prefs and
  the palette read it — but nothing navigates by it: it is an INPUT to the
  destination map, never a screen selector.
- **Navigating INTO Settings goes through `useUIStore.openSettings(section)`**,
  never a bare `setViewMode("settings")`. Settings is two pieces of state (the view
  AND `settingsSection`) and one call sets both: a plain open lands on the index, a
  deep link lands on its section even when Settings is already open. `SettingsView`
  owns the settings analytics (one `tab_opened` per surface actually reached) with
  the shell's generic viewMode effect skipping `settings` so a deep link can't
  double-count. The one-shot deep-link pin (`useOrgNav`, for Admin) is cleared by
  `settings-nav-pins.ts` when a blocked section falls back to the index.
- **Configure gating.** The settings page's ONE door is Team Settings, so its gate
  is per AGENT: `canOpenAgentSettings(caps, agent)` (`lib/agent-nav.ts`) =
  `canSeeTeamSettings(caps)` `|| isAgentManager(caps, agent)`. Every "configure
  this agent" affordance must make this check before rendering, so a caller who
  cannot reach the page is never shown a link. Inside the page `isAgentManager`
  decides the FACE (editable vs `readOnly`), never access; the gateway 403s any
  configure-scope write regardless. The agent's **Share** affordance
  (`AgentShareSurfaces`) lives in that page's header.
- Old `tabs` / `defaultTab` fields on installed manifests are ignored by the
  loader; the `agents:tabLabels.*` i18n block was deleted.

## Store templates (built-in, baked at build time)

- Source of truth is `store/agents/<id>/houston.json` (+ `CLAUDE.md`, art, skills).
- `scripts/gen-agent-templates.mjs` GENERATES `app/src/agents/builtin/store-catalog.ts`
  — light cards (id, name, description, icon/image, category, tags, integrations)
  for the picker. Regenerate after editing `store/`.
- The heavy payload (CLAUDE.md + skills + seed data) lives in
  `app/src/agents/builtin/store-templates/<id>.json`, lazily loaded on create by
  `store-template-loader.ts` and applied through the wire `seeds` contract.
- **Consequence: templates ship with the app release, not over the wire.** There is
  no runtime store catalog and no update-sync on this path — the host's
  agent-config surface is the GitHub library only ("the store catalog/updates half
  of that surface stays cut", `packages/host/src/routes/agent-configs.ts`). The
  PUBLIC Agent Store (agents.gethouston.ai, publish/install) is a separate system:
  [agent-store.md](agent-store.md).
- Template rules: no custom Overview dashboards, no manifest `useCases` for starter
  workflows — package a real skill under `.agents/skills/*/SKILL.md` instead, with
  no legacy `inputs` / `prompt_template` frontmatter. Do not seed
  `.houston/activity.json`; fresh agents start with an empty board.

## GitHub import (the installed library)

`packages/host/src/routes/agent-configs.ts` — the TS-host successor of the Rust
engine's surface (HOU-662):

- `GET /v1/agent-configs` — the installed library, merged into the create-agent
  picker.
- `POST /v1/agents/install-from-github` — body carries `owner/repo`; the host
  fetches `houston.json` (required) and `CLAUDE.md` (optional) from
  `raw.githubusercontent.com` (tries `main` then `master`) and writes:
  ```
  <root>/<agentId>/houston.json    the manifest
  <root>/<agentId>/CLAUDE.md       instructions
  <root>/<agentId>/.source.json    provenance {repo, installedAt}
  ```
  `root(userId)` is `agents` locally (mirroring the legacy `~/.houston/agents`
  tree so desktop users keep their configs) and per-user in cloud. Ids must match
  `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` — the id becomes a vfs key.
- No library wired → `GET` answers `[]` (honest: nothing installed) but `POST`
  fails **503** rather than pretend to work.
- **Multi-agent workspace templates are GONE.** There is no `workspace.json`, no
  `agents/` bundle import, and no host route for one. `ui/engine-client`'s
  `installWorkspaceFromGithub` → `POST /workspaces/install-from-github` is a dead
  stub: the app never uses `ui/engine-client` at runtime (both vite configs alias
  it to `packages/web/src/engine-adapter/`) and no host serves that path.

## Agent creation

- CLAUDE.md is seeded from the manifest's `claudeMd` field or its `CLAUDE.md` file;
  fallback is a generic template. `agentSeeds` writes additional files.
- A seed-write failure **rolls back the whole agent creation** in the host
  (`packages/host/src/routes/agents.ts`) — an agent never lands half-seeded.
- The E5 "create from org template" path (`CreateAgent.templateId` +
  `gateway.agent_templates`) was removed in E8. Teams agents are created like any
  other; the manager configures instructions/skills/model/allowlist afterward.

## Agent activation — every new agent runs a self-setup mission

After ANY agent is created (from-scratch, AI-assisted, template) or imported
(friend-import wizard), Houston **auto-starts a real first mission in the normal
shell** where the agent helps the user set *itself* up. No full-screen onboarding,
no separate screens. "The agent creates itself."

- **Kickoff bubble vs hidden directive.** `lib/agent-setup-mission.ts`
  `startAgentSetupMission(agent, { provider, model }, source)` calls the shared
  `createMission` with the *visible* user bubble
  (`agentOnboarding:setupMission.kickoff` = "Help me get set up") as the text, and
  the full instructions carried through `buildPrompt` →
  `buildSetupMissionPrompt(agentName)`. `buildPrompt` reaches the engine as system
  context and never renders as a chat line — so there is **no CLAUDE.md mutation
  and none of the old strip/sweep/pending machinery**.
- Effort is pinned `medium`. It publishes the new mission's identity for the board
  (`publishCreatedMission`, `lib/created-mission-handoff.ts` — without it the panel
  opens on a card nobody can name and the welcome chat is blank), then opens the
  chat via `useUIStore.setActivityPanelId(conversationId, { forceOpen: true })`.
- On a warming (hosted) agent `createMission` queues the send and returns without
  throwing; on the local path a throw is caught and shown via `showErrorToast`
  (`setupMission.startFailed`). Never silent.
- **The prompt** keeps the reply-in-the-user's-language idiom (detect the language;
  Latin-American neutral `tú` / Brazilian `você`) and the non-technical voice
  (never mention files, folders, configs, internals). It tells the agent to persist
  each thing as the user says it — lasting preferences into instructions,
  repeatable procedures into Skills, anything scheduled into a Routine (ask for the
  time, confirm first) — and briefly confirm what it saved, never batch for later.
- **In-dialog connect step (declared integrations only).** For a template whose
  definition declares non-empty `integrations` AND a deployment serving them
  (`integrationsAvailable(capabilities)`), the create dialog does NOT close — it
  advances to a `"connect"` step inside `DialogContent`
  (`components/shell/connect-apps-step.tsx`): one tile per declared toolkit
  (`connect-step-tile.tsx`) with the real `AppLogo` + a per-tile Connect running the
  app's own OAuth via `useConnectFlow({ agentId })`. Footer is a single primary
  "Done"; no Back (the agent already exists), and Escape/outside-close just close.
  **The setup mission fires BEFORE this branch**, so it runs regardless. The import
  wizard has no connect step.
- i18n namespace `agentOnboarding` (en/es/pt): `setupMission.*`
  (title/kickoff/startFailed) + `connect.*`.
- Analytics: `agent_onboarding_started { source: "created" | "imported" }` — the
  only surviving `agent_onboarding_*` event.
- `WELCOME_SESSION_PREFIX` / `isWelcomeSessionKey` survive in
  `lib/agent-welcome.ts` ONLY so boards from older builds still render their
  derived greeting.

## First-run setup (in-app)

- Setup order: language gate → sign-in → agreement (`DisclaimerGate` renders inside
  App, after auth; cloud web skips it) → mandatory 3-question survey (job / industry /
  automation goal; "Something else" opens a required free-text field, stored as
  `segmentOther`/`industryOther` in the survey record; the gateway mirror carries the
  four original fields only).
- The setup itself runs IN the app: the shell opens with the overlay from
  `app/src/components/onboarding/in-app-onboarding.tsx`. Center cards narrate
  (Houston logo + live setup checklist); `TutorialSpotlight` cuts a click-through
  hole over the real control; steps advance on app state via the pure machine
  `in-app-onboarding-flow.ts` (unit-tested).
- Sequences: connect AI (AI hub) → connect apps (Integrations; only when composio is
  served) → create an agent through the real New-agent dialog (coached in-dialog; the
  store tile is disabled; the auto setup-mission is suppressed on first-run armings
  only) → a prewritten locked "Send me a hello email" first task (CLAUDE.md directive
  from `tutorial-system-prompt.ts`, stripped on every exit) → finale on the agent's
  real send (completion marker), confetti at each milestone.
- Already-done steps show an addendum + Skip step; there is no other escape — the
  setup is mandatory (Julian's rule). Resume: first-run arming stamps
  `onboarding_pending`, every finish clears it and marks `onboarding_completed`.
  "Guide me" (sidebar help) replays the setup without first-run side effects.


## Routines are created chat-first

Starting a new routine opens a scripted **in-chat intake**
(`app/src/components/agent/automation-intake/`) — cards that look exactly like the
agent's real `ask_user` cards but run locally with zero model calls: a fork ("from
scratch" vs "from a template"), then, where the deployment can fire event triggers,
a wake question (schedule / app event / webhook). Skipping any question hands off to
a full AI interview. There is no form editor and no modal wizard; everything else
about a routine is changed by asking the agent in its setup chat, which opens in the
**shell-level mission panel** (`useShellDetailPanel`, the same panel the boards use).
Machinery: `use-routine-chat-setup.ts`, `use-routines-tab-view.ts`,
`routines-tab-pane.tsx` under `components/agent/`, mounted by the TEAM Routines
section, one child per owning agent. Library surface: `@houston-ai/routines`
(`ui/routines/README.md`). Trigger side: [routine-triggers.md](routine-triggers.md).

## Sidebar structure

The rail is a list of TEAMS; every agent belongs to exactly one, and the trailing
DEFAULT team is the workspace itself (virtual — nothing is written to
`sidebar_layout` to make it exist, which is why it has no caret and no menu). What
a team MEANS, the `team` screen, and the store contract: [teams-ui.md](teams-ui.md).
The row-rendering vocabulary (`SidebarRowButton`, geometry):
[sidebar-anatomy.md](sidebar-anatomy.md). Structure, persistence and i18n keys here:

- Rows show a count chip for `needs_you` activity items; a `running` item gives the
  avatar the same comet glow as running board cards. The `...` menu replaces the
  count chip on hover/focus and keeps it hidden while open (Rename, Change color →
  colour submenu, Delete). Agent mutations live in
  `components/shell/use-sidebar-agent-actions.ts`, not the rail component.
- **Ordering is always manual** — no sort mode. Agents drag to reorder or into
  another team. Section rows (Mission Control, Team Settings) are destinations,
  never members: not draggable, not drop targets; a drag over one targets the
  owning team. **Collapsing a team folds away its AGENT rows only** — destination
  rows stay (`sidebar-group-section.tsx` keeps `SidebarSectionRows` outside the
  `collapsed` gate), because they are how the user gets back in.
- Arrangement persists per workspace as the `sidebar_layout` preference, shape
  `SidebarLayout { groups: SidebarGroup[]; ungroupedOrder: string[] }`
  (`packages/protocol/src/domain/workspace.ts`). Absent/corrupt reads as
  `{ [], [] }`. **The stored shape did not change when the rail became teams.**
- **Persistence trap — the adapter, not the host route.** A host route exists
  (`GET`/`PUT /v1/workspaces/:id/sidebar-layout` in `routes/account.ts`, validator
  in `routes/sidebar-layout.ts`, emits `SidebarLayoutChanged`, and diffs per-agent
  resolved context to mirror `GROUP.md` via `routes/group-context-sync.ts`), **but
  the shipped client does not call it**: `packages/web/src/engine-adapter/client/workspaces-mixin.ts`
  persists sidebar layout to `localStorage` (`houston.sidebar-layout.<workspaceId>`)
  deliberately, so a stale sidecar without the route can't 404 every drag. Both
  `app/vite.config.ts` and `packages/web/vite.config.ts` alias
  `@houston-ai/engine-client` → the adapter, and its `HoustonClient` wraps unknown
  methods in a Proxy stub returning `[]` — so a new client method MUST be added to
  the adapter or the app silently gets `[]`.
- **App wiring:** `hooks/use-sidebar-layout.ts` — two hooks, one query.
  `useSidebarLayoutValue(workspaceId)` is the READ (TanStack Query + memoized
  `normalizeSidebarLayout`); `useSidebarLayout(workspaceId)` adds the optimistic
  mutation + rail helpers. `useTeams()` and the command palette take the read-only
  one. Plus the non-React `getCurrentSidebarLayout`; `createGroup` returns the new
  id so the rail can focus its rename. Pure reducers in `lib/sidebar-layout-ops.ts`;
  ordering in `lib/agent-order.ts` (`resolveSidebarSections` / `flatSidebarOrder` —
  the SAME order feeds ⌘[ / ⌘] cycling and the command palette). Composition:
  `components/shell/team-sidebar-lists.tsx`.
- **Generic UI:** `AppSidebar` (`ui/layout`) takes `groups: SidebarGroupView[]`,
  `sectionAction`, `renamingGroupId`, and **@dnd-kit** drag (always on when
  `groups` is passed): a `DragOverlay` lifted row, animating siblings, moves
  within/across groups and the default section, group headers reorder whole groups;
  pointer/touch/keyboard sensors, `MeasuringStrategy.Always`. Orchestrator
  `sidebar-grouped-list.tsx` keeps a working copy that `onDragOver` live-reorders
  (`placeItem`'s direction-aware `arrayMove`) and `onDragEnd` simply commits — do
  NOT recompute from `over` at drop, it can be the dragged item itself. Pure helpers
  `sidebar-dnd.ts`. `SidebarGroupView.sections?` draws destination rows above item
  rows; `AppSidebar.defaultGroup?` turns the trailing section into a labelled,
  non-collapsible block (`SidebarDefaultHeader`). **Both kinds of row say "you are
  here" with `aria-current="page"`** — that, not `bg-sidebar-active`, is what e2e
  asserts, so a repaint can't break a navigation test.
- **Team shared context.** `SidebarGroup.context?: string` — one note shared by
  every agent in that team (a team-scoped `WORKSPACE.md`), edited from the team
  header's "..." → "Edit shared context"
  (`components/shell/group-context-dialog.tsx`), saved via `sidebar.setGroupContext`
  → `setGroupContextOp` → the same layout write. Runtime read side:
  `buildGroupContextSection` (`packages/runtime/src/session/workspace-context.ts`),
  injected after the workspace/user context section and before the mode overlay —
  present only for grouped agents (no empty-marker stub, unlike WORKSPACE.md /
  USER.md). Local/self-host only.
- **Multiplayer:** no Admin / Permissions / Time worked entries since HOU-788 —
  those are Settings sections gated by `useSurfaceGates`. **New Agent** is gated on
  `canCreateAgents` (`useCanCreateAgents`). Full client model: [teams.md](teams.md).
- i18n: `shell:sidebar.yourTeams`, `shell:sidebar.newTeam`,
  `shell:sidebar.teamSections.*`, `shell:sidebar.teams.*` (en/es/pt). The old
  `sidebar.yourAgents` / `sidebar.groups.*` keys are gone.
- e2e: `packages/web/e2e/sidebar-dnd.spec.ts` (Chromium + WebKit; drags re-read the
  reflowing target's live position — fixed pre-drag coords miss),
  `sidebar-teams.spec.ts` (structure), `ui/layout/tests/sidebar-item-row-layout.test.ts`
  (one glyph column across section and agent rows).

## Workspaces

- Local/self-host: `~/.houston/workspaces/<Workspace>/<Agent>/`.
- Host routes: `GET /v1/workspaces` (cloud personal-tier auto-provisions one; local
  returns every workspace on disk), `PATCH /v1/workspaces/:id` (locale only —
  name is fixed, provider/model live on each agent's config), `GET|PUT
  /v1/workspaces/:id/sidebar-layout`. All in `packages/host/src/routes/account.ts`.
- **The shipped client's workspace list is synthetic + team spaces.**
  `WorkspacesMixin.listWorkspaces()` returns ONE synthetic personal row (its
  `"default"` id is load-bearing for prefs, caches and the desktop boot path) plus
  the host's `org:<slug>` team rows. `createWorkspace` / `renameWorkspace` /
  `deleteWorkspace` / `setWorkspaceProvider` are synthetic no-ops in the adapter.
  A 404 on the list is capability negotiation (host predates team spaces → personal
  only); **every other failure THROWS** (HOU-981) so a transient blip lands on the
  store's `loadError` with a retry instead of silently hiding a Teams user's spaces.
- Store: `useWorkspaceStore` (`app/src/stores/workspaces.ts`) —
  `loadWorkspaces()`, `setCurrent()`, `create()`, `rename()`, `delete()`, plus
  `loaded` / `loadError` for the boot-splash and Settings retry gates.
- Multi-space (personal + team) semantics, the `x-houston-org` pin, seat billing:
  [teams.md](teams.md).

## Prompt assembly

The final system prompt is composed by the pi agent loader
(`makeAgentLoader`, `packages/runtime/src/session/resource-loader.ts`) in a fixed
order:

1. **Product layer** — `config.systemPrompt` (the embedding app's prompt) else the
   runtime's `SYSTEM_PROMPT`. The Houston desktop shell builds its copy in
   `app/src-tauri/src/houston_prompt/` and hands it over at spawn
   (`HOUSTON_APP_SYSTEM_PROMPT` + `HOUSTON_APP_ONBOARDING_PROMPT`); the host's own
   copy is `packages/host/src/houston-prompt.ts`. The engine keeps them as opaque
   strings. Callers can override per-session via `startSession`'s `systemPrompt`.
2. **Workspace + user context** — `buildWorkspaceContextSection(cwd, provided)`
   (`session/workspace-context.ts`) from `<workspace>/WORKSPACE.md` +
   `<workspace>/USER.md`, or the gateway's provided copy in cloud. Files are NOT
   seeded — until one exists the section renders an "(empty so far, ask the user
   when relevant)" marker. The section authorizes the agent to read/write those two
   files (a carve-out from the working-directory rule) and says edits take effect on
   the NEXT chat.
3. **Group context** — `buildGroupContextSection(cwd)` reads `<agent-root>/GROUP.md`;
   `null` when ungrouped, with no empty-marker stub.
4. **Turn mode overlay** — LAST, so the plan/auto mandate is the final word
   (`withModeOverlay`, `session/mode-overlays.ts`).

**`CLAUDE.md` / `AGENTS.md` are loaded by the pi agent loader**, via
`agentsFilesOverride` → `loadWorkspaceContextFile(cwd)` — not by any CLI (there are
no provider CLIs) and not concatenated into the string above. The skills index
(`<available_skills>`) is appended by pi from `skillsDir`
(`config.skillsDirOverride` else `<cwd>/.agents/skills`), with
`HOUSTON_SHARED_SKILLS_DIR` contributing manifest-filtered workspace-shared skills.
The Anthropic/Claude backend mirrors the same composition in
`packages/runtime/src/backends/claude/system-prompt.ts`.

Users cannot edit the product prompt — it is compiled in. User-editable per-agent
surfaces: `CLAUDE.md` (job description), `.agents/skills/`,
`.houston/learnings/learnings.json`. Per-workspace: `WORKSPACE.md`, `USER.md`
(Settings → Workspace → Shared context, or written by agents). Per-team: `GROUP.md`.

## Board

`@houston-ai/board::AIBoard` = `KanbanBoard` + `KanbanDetailPanel` + `ChatPanel` —
generic, props-only. Each card is an activity from `.houston/activity/activity.json`;
click opens chat with conversation history. Props: `items, feedItems (keyed by
sessionKey), isLoading, onCreateConversation, onSendMessage, onLoadHistory, onDelete,
onApprove, onSelect, selectedId`, plus multi-select (`selectable, selectedIds,
onToggleSelect, selectionLockColumnId, bulkActions`) and drag-and-drop
(`onItemMove, canDropItem`). Columns can take `onAdd` → a "+" button. Kept-alive
screens, keyboard ownership and the ONE shared detail panel:
[board-shell.md](board-shell.md).

- **One component, one source.** Every team's board
  renders `<MissionBoard source={…}>` (`app/src/components/board/`), which owns
  columns, multi-select, `useAgentChatPanel`, the message queue, draft persistence,
  keyboard nav, run-in-terminal actions and the full AIBoard prop spread. There is
  exactly ONE `BoardSource`: `useMissionControlSource(agents, onShowArchived,
  scope?)` — cross-agent data, cross-agent bulk (grouped by owning
  agent), cross-agent DnD (a dragged card moves within its own agent), an
  agent-picker "New mission", and the filter/search/Archived toolbar.
  `TeamMissionBoard` is its ONE mount, always with a `MissionControlScope`: there
  is no global board any more. The per-agent `useAgentBoardSource` is gone with
  the tab shell. **Adding a board capability = add it to `<MissionBoard>` or the one
  `BoardSource`.**
- **The nav handoff.** Notification clicks, @mention rows, the command palette and
  the archived→active handoff publish their target as `activityPanelId`; the source
  consumes it (`resolvePendingActivitySelection`) **gated on `useIsActiveView()`**,
  so a hidden team board can never eat the target. Which SURFACE the target belongs
  to is decided once from the raw sweep rows (`lib/board-surface-nav.ts`) by
  `Dashboard` / `TeamMissionControl` through `useBoardSurfaceOnNav`.
- **Rows the sweep cannot see yet.** A mission created here exists before the sweep
  returns it, so `useMissionControl` holds its `{activityId, agentPath, sessionKey}`
  until the row lands (`board/use-just-created-mission.ts`) — without it the panel
  loses its session key and the user's first message vanishes. A mission created
  OUTSIDE any board (the self-setup mission) reaches the same fallback through
  `lib/created-mission-handoff.ts`: `publishCreatedMission(...)` runs BEFORE the
  panel opens and every mounted board adopts the offer — deliberately not one-shot
  (several boards are alive at once and the first to look is often hidden); the leak
  rule is a 30s TTL plus each board dropping it when the real row lands. Missions
  queued against a still-warming engine are overlaid the same way as
  `warmingConversations` rows (`lib/warming-board-rows.ts` +
  `hooks/use-warming-conversations.ts`); when the readiness probe clears the store
  flushes queued sends and **awaits `warmingFlushRefetchKeys(agentPath)`**
  (`lib/agent-provisioning.ts`) before `clearProvisioning` drops the optimistic rows,
  so the handoff is gapless.
- **Archive.** `TeamMissionControl` SWAPS (not hides — only the mounted view's hooks
  run) between `TeamMissionBoard` and `MissionControlArchived`. Entered from the toolbar's
  Archived button (outline pill, one rank below the filled "New mission"), left via
  the labelled `BoardBackButton` — the Archived toolbar drops the Archived pill so
  the back button is its single unambiguous exit (HOU-1043). Sending in an archived
  chat re-activates the mission (`archived → running`) and hands the user back to
  THIS screen's active board with that mission open (`useArchivedHandoff`).
- **Status transitions.** When a turn settles the SDK persists the board status
  through the `persistBoardStatus` seam (the web adapter PATCHes `{ status,
  pending_interaction }`). **The engine never writes `done`**: a clean finish →
  `needs_you` (carrying whatever pending interaction the turn ended on), a handled
  Stop / logged-out provider → `needs_you`, a real failure → `error`. Both sit in
  the **Needs you** column and both offer the card checkmark
  (`MISSION_APPROVE_STATUSES`). `done` is written ONLY by the user — checkmark, drag
  into Done, or bulk move — each firing the mission-done confetti. The resulting
  `ActivityChanged` event auto-invalidates TanStack Query.
  (`sessionStatus`/`boardStatus` pair: [client-architecture.md](client-architecture.md);
  full interaction lifecycle: [architecture.md](architecture.md).)

