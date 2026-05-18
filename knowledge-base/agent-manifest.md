# Agent Manifest

Agent definitions = what AI agent looks like. Which tabs. What prompt. What files seeded. Primary dev surface of platform.

## Three tiers

1. **JSON-only** — `houston.json` + `CLAUDE.md`. Defines tabs, prompt, colors, icon. Uses built-in tab components.
2. **Custom React** — `houston.json` + `bundle.js`. Custom components. Import `@houston-ai/*` as peer deps.
3. **Workspace template** — `workspace.json` + `agents/` folder. Bundles multiple agents from one GitHub repo.

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
  tabs: AgentTab[];
  defaultTab?: string;
  claudeMd?: string;       // CLAUDE.md template content
  systemPrompt?: string;
  agentSeeds?: Record<string, string>;
  features?: string[];     // Rust feature flags needed
}

interface AgentTab {
  id: string;
  label: string;
  builtIn?: "chat" | "board" | "skills" | "files" | "connections" | "context" | "routines" | "channels" | "events" | "learnings";
  customComponent?: string;
  badge?: "activity" | "none";
}
```

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
workspace agents pick up new tabs/defaults from the refreshed manifest.

After a bundled package update, Houston copies newly-added packaged
Skills into existing workspace agents with the same `config_id`.
Existing Skill bodies are not overwritten; user edits win. Matching
Skill frontmatter is refreshed from the bundled package so descriptions,
integrations, images, category, and featured state can update with a release.

## GitHub import flow
Engine route remains for developer/manual import. A caller posts an
`owner/repo` URL and Houston downloads `houston.json`, `CLAUDE.md`,
`icon.png`, `bundle.js` → `~/.houston/agents/{id}/`. The desktop
New Agent modal is Store-only for non-technical users.

## Agent creation
Seeds agent CLAUDE.md from manifest `claudeMd` field or manifest's `CLAUDE.md` file. Fallback: generic template.

## Default Personal assistant + tutorial

Every newly-created workspace gets a `Personal assistant` instance from the
built-in `personal-assistant` config. Users do not create it manually.
First-run onboarding is a minimal guided setup, not a static tour or dense HUD:

1. Welcome screen shows the Houston logo and two cards: start tutorial or skip.
2. Tutorial card goes straight to creating the Personal assistant.
3. User connects OpenAI or Claude Code, the agent's brain.
4. User picks one real mission.
5. User connects Composio apps, the agent's hands.
6. Houston writes one Skill and one Routine, then starts real work when apps
   are ready.
7. Normal UI opens with a command-center coach explaining parallel missions,
   multiple agents, library installs, and Routines.

Skipping onboarding still creates the default Personal assistant, but skips the tutorial Skill/Routine/run artifacts.

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
| `anthropic` (alias `claude`) | `claude` (runtime download) | `claude-sonnet-4-5` | `claude-opus-4-1` | OAuth via `claude auth login --claudeai` |
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

## Workspace
- Storage: `~/.houston/workspaces/workspaces.json` (index) + one dir per workspace `~/.houston/workspaces/{Name}/`. `HOUSTON_DOCS` env var overrides the root.
- First launch: welcome screen, create first workspace
- Engine routes: `GET /v1/workspaces`, `POST /v1/workspaces`, `POST /v1/workspaces/:id/rename`, `DELETE /v1/workspaces/:id`, `PATCH /v1/workspaces/:id/provider` (`engine/houston-engine-server/src/routes/workspaces.rs`). Frontend reaches them via `@houston-ai/engine-client` — no Tauri commands in the path.
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
4. Skills index — `.agents/skills/` via `houston_skills::build_skills_index`.
5. Integrations block — based on `.houston/integrations.json` if present.

`CLAUDE.md` is read by the CLI (claude/codex) itself at startup, not injected by the engine.

Users cannot edit the product prompt — it's compiled into the app binary. Per-agent surfaces that ARE user-editable: `CLAUDE.md` (job description), `.agents/skills/` (skills), `.houston/learnings/learnings.json` (learnings), `.houston/prompts/modes/*.md` (mode overrides).

## Board / Activity tab
`@houston-ai/board::AIBoard` = `KanbanBoard` + `KanbanDetailPanel` + `ChatPanel`. Each card = activity from `.houston/activity/activity.json`. Click → opens chat w/ conversation history. App `board-tab.tsx` ~140 lines, thin store wrapper.

`AIBoard` props: `items, feedItems (keyed by sessionKey), isLoading, onCreateConversation, onSendMessage, onLoadHistory, onDelete, onApprove, onSelect, selectedId`.

Status transitions: session completes → `useSessionEvents` (listens to the WS `*` firehose) → activity status flipped to `needs_you` via the engine update route. The emitted `ActivityChanged` event auto-invalidates TanStack Query → board refreshes.

Columns can have `onAdd` callback → renders "+" button for creating activities from board.
