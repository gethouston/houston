# Agent Manifest

Agent definitions = what AI agent looks like. What prompt. What files seeded. Primary dev surface of platform.

## Two tiers

1. **JSON-only** — `houston.json` + `CLAUDE.md`. Defines prompt, colors, icon, integrations. All agents share the same shell tabs (see "Tabs" below).
2. **Workspace template** — `workspace.json` + `agents/` folder. Bundles multiple agents from one GitHub repo.

## Manifest shape
```ts
interface AgentManifest {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;           // Lucide icon name
  color?: string;          // brand override
  category?: AgentCategory;
  author?: string;
  tags?: string[];
  integrations?: string[]; // Composio toolkit slugs
  claudeMd?: string;       // CLAUDE.md template content
  systemPrompt?: string;
  agentSeeds?: Record<string, string>;
  features?: string[];     // Rust feature flags needed
}
```

## Tabs

Every agent renders the same five tabs in the shell:
`Activity` (board) / `Routines` / `Files` / `Agent Settings` (tab id `job-description`) / `Integrations`.

This used to be configurable per agent via a `tabs: AgentTab[]` field in `houston.json`, plus an optional `customComponent` pointing at a per-agent `bundle.js`. The flexibility was never used in practice (zero shipped agents had a custom React tab) and caused drift between installed agents and fresh ones whenever the default set changed. The set is now hardcoded in `app/src/agents/standard-tabs.ts` (`STANDARD_TABS`, `DEFAULT_TAB_ID`). Old `tabs` / `defaultTab` fields on installed manifests are ignored by the loader.

The per-agent `Integrations` tab is a thin wrapper around the same `IntegrationsView` that the sidebar `Connections` entry renders, so the per-agent and workspace-wide surfaces are intentionally identical. The two entry points are kept because users reach for them at different moments (focused on one agent vs. setting up Houston as a whole).

## Locations
- **Built-in:** `app/src/agents/builtin/` — `personalAssistantAgent`
  (default agent for new workspaces) + `blankAgent` (start-from-scratch).
  The richer catalog lives in Houston Store under `store/agents/*`.
- **Installed:** `~/.houston/agents/{id}/houston.json` — installed from bundled Houston Store or downloaded from GitHub.
- **Override rule:** installed definition with same id as builtin → overrides builtin (dedup in `app/src/stores/agent-configs.ts`).

## Store install flow

Houston-owned Store agents are release-bundled:

```
store/
  catalog.json
    agents/<agent-id>/
      houston.json
      CLAUDE.md
      icon.png
      .agents/skills/<skill>/SKILL.md
```

`GET /v1/store/catalog` reads this bundled catalog when available.
`POST /v1/store/installs` with `repo: "houston-store/<agent-id>"`
copies the package to `~/.houston/agents/<agent-id>/` and writes
`.source.json` with `source: "houston-store"`, `version`, and
`content_hash`. Creating a workspace agent from that installed
definition copies packaged `.agents/skills/*` into the user's agent
root so chat Skills are available immediately.

Store agents must not use custom Overview dashboards or manifest
`useCases` for starter workflows. If a workflow should be visible to
users, package it as a real skill under `.agents/skills/*/SKILL.md`.
Store-packaged skills must not include legacy `inputs` or
`prompt_template` frontmatter. The chat Skill picker selects the
workflow, then the regular composer stays visible for free-form context.
Store manifests must also not seed `.houston/activity.json` or
`.houston/activity/activity.json`; fresh Store agents start with an empty
board and the app points users at New Mission. The engine ignores stale
activity seeds during create, and Store update sync clears the known
default intro card from existing Store agents only when it is the sole
board item.

Update checks compare installed `.source.json` to the bundled catalog
and refresh installed definitions when a newer app release carries a
newer package. The desktop catalog reloads after updates so existing
workspace agents pick up new manifest values (name, description,
integrations) from the refreshed manifest.

After a bundled package update, Houston copies newly-added packaged
Skills into existing workspace agents with the same `config_id`.
Existing Skill bodies are not overwritten; user edits win. Matching
Skill frontmatter is refreshed from the bundled package so descriptions,
integrations, images, category, and featured state can update with a release.

## GitHub import flow
Engine route remains for developer/manual import. A caller posts an
`owner/repo` URL and Houston downloads `houston.json`, `CLAUDE.md`,
`icon.png` → `~/.houston/agents/{id}/`. The desktop
New Agent modal is Store-only for non-technical users.

## Agent creation
Seeds agent CLAUDE.md from manifest `claudeMd` field or manifest's `CLAUDE.md` file. Fallback: generic template.

## Default Personal assistant + tutorial

Every newly-created workspace gets a `Personal assistant` instance from the
built-in `personal-assistant` config. Users do not create it manually.
First-run onboarding is a seven-mission guided setup driven by
`app/src/components/onboarding/personal-assistant-onboarding.tsx` and the
`TUTORIAL_STEPS` machine in `tutorial-copy.ts`:

1. Welcome screen offers start vs. skip.
2. **Meet** — name + color the assistant.
3. **Brain** — pick provider (OpenAI / Anthropic) and create the workspace +
   assistant.
4. **Tools** — sign into Composio so the agent has hands.
5. **Try** — one real mission (`Plan my next working day`). The agent reads
   inbox + calendar in parallel, cross-references them, posts a structured
   plan with bold sections, and saves three draft replies. Ends with the
   literal `[TUTORIAL_COMPLETE]` token. CLAUDE.md is augmented with the
   tutorial directive while this step is mounted, stripped on unmount.
6. **Skill** — same chat, one chip. The user clicks "Save this as a Skill"
   and the agent writes `.agents/skills/plan-my-working-day/SKILL.md`
   (frontmatter + procedure body) in a single shot. Ends with
   `[SKILL_COMPLETE]`. Detection prefers the on-disk `useSkills()` lookup
   (skill `name === ONBOARDING_SKILL_SLUG`) over the token. The done
   screen is a full-page `MissionDoneScreen` showing the resulting
   `SkillCard` — same component the user sees in the chat empty state.
7. **Routine** — same chat, one chip. The user clicks "Make it a routine"
   and the agent asks for one thing (the time), confirms, then appends a
   new entry to `.houston/routines/routines.json` whose `prompt` simply
   says `Run the \`plan-my-working-day\` skill.` (the procedure lives in
   the Skill from M5, the routine just schedules it). Ends with
   `[ROUTINE_COMPLETE]`. Done screen is a full-page `MissionDoneScreen`
   showing the routine name, "Every weekday at HH:MM", and which Skill
   it runs.
8. **Summary** — final celebratory screen with the assistant's avatar /
   name and the two cards (Skill + Routine) read live from
   `useSkills` + `useRoutines`. The "Enter Houston" CTA fires
   `finishOnboarding`, which arms the UI tour and clears
   `tutorialActive` so the workspace shell takes over.

**Always-on Skip.** Missions 4-7 each render a small "Skip tutorial" link
wired to `finishOnboarding` directly (not through the per-step
`onContinue`). If the model wedges or the user changes their mind, one
click stops any in-flight session and lands them in the workspace shell
with the default Personal assistant still created in M3. The Skip is
deliberately separate from `onContinue` because the latter advances
mission-by-mission.

**CLAUDE.md augmentation pattern.** Try, Skill, and Routine each append a
uniquely-marked section to the agent's `CLAUDE.md` on mount and strip it
on unmount via `tutorial-system-prompt.ts`, `skill-system-prompt.ts`,
`routine-system-prompt.ts`. Each mount-time write also strips any prior
sibling sections, and each unmount-time strip is a no-op when nothing
matches, so concurrent unmount-of-prev / mount-of-next writes converge
cleanly no matter which write lands last.

Skipping onboarding at the welcome screen still creates the default Personal
assistant, but skips every tutorial artifact: no Try mission, no Skill,
no Routine, no Summary, no UI tour.

## Workspace templates

Bundle multiple agents in one GitHub repo. Import → create workspace w/ all agents ready.

```
my-workspace/
  workspace.json
  agents/
    agent-one/
      houston.json
      CLAUDE.md
    agent-two/
      houston.json
      CLAUDE.md
```

**workspace.json:**
```json
{
  "name": "Workspace Name",
  "description": "Optional.",
  "agents": ["agent-one", "agent-two"]
}
```

**Import:** "New Workspace > Import from GitHub". Paste `owner/repo`. Houston downloads workspace.json, installs all agent defs, creates workspace, creates agent instances w/ CLAUDE.md + seed files. All agents chat-ready immediately.

Engine route: `POST /v1/store/workspaces/install-from-github`. Rust impl: `houston_engine_core::store::install_workspace_from_github`. Server wiring: `engine/houston-engine-server/src/routes/store.rs`.

## Sidebar structure

```
+-----------------------------+
| [WorkspaceSwitcher] [Settings] |
|-----------------------------|
| > Dashboard                 |  all agents overview
| > Connections               |  workspace-wide integrations
|-----------------------------|
| Your AI Agents              |
|   > Research Agent    [2]   |  sorted by lastOpenedAt
|   > Project Manager         |
|   + New Agent               |  row-style action, opens Store picker
+-----------------------------+
```

Agent rows show a count chip for `needs_you` activity items. If any
activity item is `running`, the row avatar uses the same comet glow as
running board cards. The row `...` menu replaces the count chip on hover
and keyboard focus. It keeps the count chip hidden while open. The first-level
menu shows Rename, Change color, Delete; Change color opens the color picker
submenu.

## Provider + model wiring

Each workspace pins a provider + model. Set via `PATCH /v1/workspaces/:id/provider`,
read by every session start. Frontend catalog: `app/src/lib/providers.ts`.
Backend registry: `engine/houston-terminal-manager/src/provider/` (one file per
adapter, see `knowledge-base/architecture.md`).

| Provider id | CLI | Default model | Premium model | Login flow |
|---|---|---|---|---|
| `anthropic` (alias `claude`) | `claude` (runtime download) | `claude-sonnet-5` | `claude-opus-4-8` | OAuth via `claude auth login --claudeai` |
| `openai` (alias `codex`) | `codex` (bundled) | `gpt-5` | `gpt-5-codex` | OAuth via `codex login` |
| `gemini` (alias `google`) | `gemini` (bundled, macOS only) | `gemini-2.5-flash` | `gemini-2.5-pro` | API key, no CLI login (see `knowledge-base/auth.md`) |

Notes:
- Gemini has no `gemini login`. The picker short-circuits on
  `loginKind === "apiKey"` and opens the Connect-API-Key dialog
  (`app/src/components/shell/api-key-connect-dialog.tsx`). Calling
  `/v1/providers/gemini/login` directly returns `BadRequest`.
- Gemini is macOS-only in v1; Windows users see it as unavailable until
  the phase-2 fork-build lands (see `knowledge-base/cli-bundling.md`).
- Adding a fourth provider = one new adapter file + one registry entry +
  three dispatch arms (runner, parser, summarizer). See "Engine boundary"
  in `CLAUDE.md`.

### Switching provider mid-conversation

The picker is **never locked** — the user can switch a live conversation to a
different provider at any time (HOU-424). Provider CLI sessions are not portable
(Claude's resume id means nothing to Codex), so the engine runs a FRESH session
on the new provider seeded with prior context, reusing the compaction machinery:

- **Fits the new model's window** → carry the full transcript over verbatim
  (`replay`). Lossless, but reloading the whole conversation costs tokens.
- **Doesn't fit** → summarize with the TARGET provider to fit (`summarize`).
  Lossy + spends a summarizer call.

**Both** modes ask for confirmation first via `ProviderSwitchDialog` (they both
spend tokens, scaling with the current conversation size), with mode-specific
copy. The switch is staged only on confirm.

The size decision is frontend-only — the context-window catalog lives in
`app/src/lib/providers.ts` (`app/src/lib/provider-switch.ts::decideHandoffMode`).
The choice is staged in `app/src/stores/provider-switch.ts`, forwarded on the
next send as `POST .../sessions { providerSwitch: { mode, fromProvider } }`, and
the engine reseeds in `houston_engine_core::sessions::run_start`: it clears the
resolved provider's current resume id (so a switch-**back** never resumes a
session missing the other provider's turns), builds the seed
(`compaction::build_replay_seed` or `build_compaction_seed`, both reading the DB
`chat_feed`, the summary running on the TARGET provider), and emits a
`provider_switched` boundary divider. Because the handoff never touches the
provider being LEFT, switching away from one that is out of credits or rate
limited works. A seed failure surfaces as a session error (no silent
blank-start); the staged handoff is cleared only on the `provider_switched`
event, so a failed switch is retried on the next send.

### Reasoning effort

Effort is **per-agent and model-gated**. Stored as `effort` in the agent's
`.houston/config/config.json` (schema `ui/agent-schemas/src/config.schema.json`),
set from the model picker (`app/src/components/chat-model-selector.tsx`), which
shows only the levels the active model accepts.

- The engine resolves it in `houston_engine_core::sessions::resolve_effort`
  (`engine/houston-engine-core/src/sessions/provider.rs`): the configured value
  when the **final** provider accepts it, else the provider's `default_effort`
  (`medium`), else `None` for providers with no effort control. An explicit
  `effort` on `POST .../sessions` (the onboarding tutorial) still wins over
  config. Applies to chat, board missions, routines, and onboarding alike.
- Valid levels live on the `ProviderAdapter` (`effort_levels` / `default_effort`)
  as a provider-level **superset** used for validation; per-model availability
  is a picker concern (`ModelOption.effortLevels` in `providers.ts`).

| Provider | Model | Effort levels offered | CLI flag |
|---|---|---|---|
| `anthropic` | `claude-opus-4-8` (Opus 4.8) | low, medium, high, xhigh, max | `--effort <v>` |
| `anthropic` | `claude-opus-4-7` (Opus 4.7) | low, medium, high, xhigh, max | `--effort <v>` |
| `anthropic` | `claude-sonnet-5` (Sonnet 5) | low, medium, high, xhigh, max | `--effort <v>` |
| `anthropic` | `claude-sonnet-4-6` (Sonnet 4.6) | low, medium, high, max (no `xhigh`) | `--effort <v>` |
| `openai` | `gpt-5.5` | low, medium, high, xhigh (no `max`) | `-c model_reasoning_effort="<v>"` |
| `gemini` | any | none | (no flag) |

Claude self-clamps an unsupported `--effort` down to its highest supported
level; codex has no such fallback, so `max` (an unknown variant to codex) is
never offered for OpenAI. Default for every effort-capable provider is `medium`.

## Workspace
- Storage: `~/.houston/workspaces/workspaces.json` (index) + one dir per workspace `~/.houston/workspaces/{Name}/`. `HOUSTON_DOCS` env var overrides the root.
- First launch: welcome screen, create first workspace
- Engine routes: `GET /v1/workspaces`, `POST /v1/workspaces`, `POST /v1/workspaces/:id/rename`, `DELETE /v1/workspaces/:id`, `PATCH /v1/workspaces/:id/provider`, `GET|PUT /v1/workspaces/:id/context` (`engine/houston-engine-server/src/routes/workspaces.rs`). Frontend reaches them via `@houston-ai/engine-client` — no Tauri commands in the path.
- Store: `useWorkspaceStore` — `loadWorkspaces()`, `setCurrent()`, `create()`, `rename()`, `delete()`

## Prompt assembly
The final system prompt is `<product_prompt>\n\n---\n\n<agent_context>`, built in two layers:

**Product layer (owned by the embedding app, not the engine).**
Lives in `app/src-tauri/src/houston_prompt/` for the Houston desktop app. Covers the app-context dictionary, concise user voice, the silent interaction loop (classify request, check info, check integrations, decide approval, execute, consider memory), Skills/memory guidance, Routines guidance, and Composio guidance. Passed to the engine at boot via env vars `HOUSTON_APP_SYSTEM_PROMPT` + `HOUSTON_APP_ONBOARDING_PROMPT` — the engine keeps them as opaque strings. Callers can also override per-session via the `systemPrompt` field on `startSession`.

**Agent-context layer (engine-owned).**
Built in `engine/houston-engine-core/src/agents/prompt.rs::build_agent_context`:
1. **Working directory block** — hard rules scoping file I/O to `<agent-root>`.
2. Mode file `.houston/prompts/modes/<mode>.md` (optional, user-editable).
3. Learnings snapshot — `.houston/learnings/learnings.json`, text fields only, rendered as bounded background context. IDs/timestamps stay storage/UI-only.
4. **Workspace context block** — assembled from `<workspace>/WORKSPACE.md` + `<workspace>/USER.md` (the agent's parent dir) by `workspace_context::build_prompt_section`. Always included for any agent whose parent dir has a `.houston/`. Files are NOT seeded — they only exist once the user or an agent writes them; until then the section renders an "(empty so far, ask the user when relevant)" marker so the agent knows the slot exists. Section explicitly authorizes the agent to read/write these two files (carve-out from the working-directory rule) and tells it that edits take effect on the **next** chat.
5. Skills index — `.agents/skills/` via `houston_skills::build_skills_index`.
6. Integrations block — based on `.houston/integrations.json` if present.

`CLAUDE.md` is read by the CLI (claude/codex) itself at startup, not injected by the engine.

Users cannot edit the product prompt — it's compiled into the app binary. Per-agent surfaces that ARE user-editable: `CLAUDE.md` (job description), `.agents/skills/` (skills), `.houston/learnings/learnings.json` (learnings), `.houston/prompts/modes/*.md` (mode overrides). Per-workspace surfaces (shared by every agent in the workspace): `WORKSPACE.md` (about the company/project), `USER.md` (about the human running it). Both edited from Settings → Workspace → Shared context, or directly by agents when the user shares new info.

## Board / Activity tab
`@houston-ai/board::AIBoard` = `KanbanBoard` + `KanbanDetailPanel` + `ChatPanel`. Generic, props-only. Each card = activity from `.houston/activity/activity.json`. Click → opens chat w/ conversation history.

`AIBoard` props: `items, feedItems (keyed by sessionKey), isLoading, onCreateConversation, onSendMessage, onLoadHistory, onDelete, onApprove, onSelect, selectedId`, plus the multi-select (`selectable, selectedIds, onToggleSelect, selectionLockColumnId, bulkActions`) and drag-and-drop (`onItemMove, canDropItem`) surface.

### Shared board (`app/src/components/board/`)
The per-agent board tab AND cross-agent Mission Control render **one** component, `<MissionBoard source={…}>`, which owns every shared concern: columns, multi-select UI, `useAgentChatPanel`, the message queue, draft persistence, keyboard nav, run-in-terminal actions, and the full AIBoard prop spread. The divergent bits live behind a `BoardSource` (headless-logic pattern):

- `useAgentBoardSource(agent, agentDef)` → single-agent data + per-agent bulk + default-mode "New mission" + DnD. Consumed by the thin `tabs/board-tab.tsx`.
- `useMissionControlSource(agents, onShowArchived)` → cross-agent data (`useMissionControl`) + cross-agent bulk (`useCrossAgentSelection`, groups bulk ops by owning agent) + cross-agent drag-and-drop (a dragged card moves within its own agent; `useMcActions.handleItemMove` routes the status change to that card's agent path) + an agent-picker "New mission" + the filter/search/Archived toolbar. Consumed by `MissionControlActive`.

`dashboard.tsx` toggles (swaps, not hides — so only the mounted view's hooks run) between `MissionControlActive` and the cross-agent **Archived** view (`MissionControlArchived` + `useMissionControlArchived`) via the toolbar's Archived button. The Archived view is the per-agent Archived tab's list UI spanning every agent; sending in an archived chat re-activates the mission (`archived → running`) and hands off to that agent's board (`setCurrent` + `setViewMode("activity")` + `setActivityPanelId`).

Adding a board capability = add it to `<MissionBoard>` (both board views get it) or to one `BoardSource` (just that view). `archived-tab.tsx` (per-agent) still renders `AIBoard` directly (list layout) and shares the same primitives.

Status transitions: session completes → `useSessionEvents` (listens to the WS `*` firehose) → activity status flipped to `needs_you` via the engine update route. The emitted `ActivityChanged` event auto-invalidates TanStack Query → board refreshes.

Columns can have `onAdd` callback → renders "+" button for creating activities from board.
