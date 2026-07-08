# Agent Manifest

Agent definitions = what AI agent looks like. What prompt. What files seeded. Primary dev surface of platform.

> **Updated: Houston runs on the TypeScript host now — the Rust `engine/` was removed.** The routes, schemas, and behavior below are current, but `engine/houston-*` crate names and `.rs` paths are historical pointers; the implementation lives in the **host** (`packages/host`), `packages/domain`, and the **pi runtime**.

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

**Manager-only configure gating (Teams v2).** Agent Settings
(`job-description-tab.tsx`) is **hidden** from a plain member of a shared agent:
`standard-tabs.ts` only adds the `job-description` tab for single-player or
`isAgentManager` callers, so it is a manager-only two-column admin page with no
read-only variant. The Integrations tab gates its edits on `isAgentManager` /
`canEditAgentGrants`. The gateway 403s any configure-scope write regardless —
these gates only avoid showing a dead control. The **Share**
dialog (`agent-share-dialog.tsx`) — a Drive-style people-with-access sheet
backed by `setAgentAssignments` v2 — is gated on `canManageAssignments`. See
`knowledge-base/teams.md`.

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

(The E5 "create from org template" path — `CreateAgent.templateId` +
`gateway.agent_templates` — was removed in E8. Teams agents are created like any
other; the manager configures instructions/skills/model/allowlist afterward. See
`knowledge-base/teams.md`.)

## Default Personal assistant + tutorial

Every newly-created workspace gets a `Personal assistant` instance from the
built-in `personal-assistant` config. Users do not create it manually.
First-run onboarding is a seven-mission guided setup driven by
`app/src/components/onboarding/personal-assistant-onboarding.tsx` and the
`TUTORIAL_STEPS` machine in `tutorial-copy.ts`:

1. Welcome screen offers start vs. skip.
2. **Meet** — name + color the assistant.
3. **Connect** — connect your AI in a single `connect` step
   (`missions/connect-ai.tsx`) that embeds the shared `<ProviderBrowser>` (the
   same ai-hub marketplace surface, via `useProviderBrowserData`), so onboarding
   lists this deployment's full runnable catalog with search + quick-filter and
   connects through every auth type (OAuth, API key, OpenAI-compatible endpoint,
   Copilot enterprise). Replaces the old bespoke `brain` (OpenAI/Anthropic pick) +
   `providerLogin` pair; it fires the `ai_provider_connected` funnel event
   (ref-guarded, once per install) and auto-advances to the `aiConnected` success
   screen the instant a provider connects. The workspace + assistant are
   provisioned by the create-agent step, not here.
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
| > Dashboard                 |  all agents overview (Mission Control)
| > AI models                 |  the AI Hub top-level view (viewMode "ai-hub")
| > Connections               |  workspace-wide integrations
| > Organization              |  Teams v2 dashboard (owner/admin + multiplayer only)
|-----------------------------|
| Your AI Agents          [+] |  section label + folder-plus "New group" button
|   ▾ Work                 [2]|  a named, collapsible group (drag its title to move it)
|     > Research Agent    [2] |
|     > Project Manager       |
|   > Trip Planner            |  ungrouped agents (default section)
|   + New Agent               |  row-style action, opens Store picker
+-----------------------------+
```

**Reorder + grouping (per-workspace).** Ordering is **always manual** — there
is NO sort mode. Agents are always drag-and-droppable to reorder or to drop into
a group; a folder-plus button to the right of the "Your agents" label creates a
group (which appears already in inline-rename, focused). Arrangement persists per
workspace as the `sidebar_layout` **preference** (same `ws/<id>/preferences.json`
doc as `locale`; reuses `getPreference`/`setPreference`), shape `SidebarLayout {
groups: SidebarGroup[]; ungroupedOrder: string[] }`
(`packages/protocol/src/domain/workspace.ts`; a brand-new agent appears at the
end of the default section). Absent/corrupt reads as `{ [], [] }`.

- **Host:** `GET`/`PUT /v1/workspaces/:id/sidebar-layout` in
  `routes/account.ts` (validator/reader extracted to `routes/sidebar-layout.ts`);
  PUT emits `HoustonEvent SidebarLayoutChanged { workspaceId }`.
- **Client (TWO places — this is the trap):** the app never uses
  `ui/engine-client` at runtime. `app/vite.config.ts` AND
  `packages/web/vite.config.ts` both alias `@houston-ai/engine-client` →
  **`packages/web/src/engine-adapter/`** (the v3 host adapter), and its
  `HoustonClient` wraps unknown methods in a **Proxy stub that returns `[]`**.
  So a new client method MUST be added to the adapter (`engine-adapter/client.ts`
  + `control-plane.ts` cpFetch helper) or the app silently gets `[]` (which then
  broke `layout.groups.map` until the client normalized it). `getSidebarLayout`/
  `setSidebarLayout` live in BOTH `ui/engine-client` (types + client, tests) and
  the adapter (host-backed via cpFetch when `this.cp` set, else localStorage).
- **Generic UI:** `AppSidebar` (`ui/layout`) gained optional `sectionAction`
  (rendered by the section label — the app passes the folder button), `groups:
  SidebarGroupView[]`, group callbacks, `renamingGroupId` (opens a just-created
  group into inline-rename), and **@dnd-kit** drag (always on when `groups` is
  passed). Real sortable: a `DragOverlay` lifted row follows the cursor, siblings
  animate, agents move within/across groups + the default section, group headers
  reorder whole groups; pointer/touch/keyboard sensors, `MeasuringStrategy.Always`
  for smooth reflow. Orchestrator `sidebar-grouped-list.tsx` keeps a working copy
  that `onDragOver` live-reorders (both same- and cross-container via
  `placeItem`'s direction-aware `arrayMove`) and `onDragEnd` simply commits — do
  NOT recompute from `over` at drop, it can be the dragged item itself. Pure
  helpers `sidebar-dnd.ts`. Absent `groups` → the old flat list; the collapsed
  rail always renders flat. Verified end-to-end by
  `packages/web/e2e/sidebar-dnd.spec.ts` (Chromium + WebKit; drags re-read the
  reflowing target's live position — fixed pre-drag coords miss).
- **App wiring:** `hooks/use-sidebar-layout.ts` (TanStack Query + optimistic
  mutation + non-React `getCurrentSidebarLayout` accessor; `createGroup` returns
  the new id so the sidebar can focus its rename), pure reducers in
  `lib/sidebar-layout-ops.ts` (+ `normalizeSidebarLayout` guarding every read),
  ordering in `lib/agent-order.ts` (`resolveSidebarSections` / `flatSidebarOrder`
  — the SAME order feeds ⌘[ / ⌘] cycling + the command palette). Group labels
  live under `shell:sidebar.groups.*` (en/es/pt).

Agent rows show a count chip for `needs_you` activity items. If any
activity item is `running`, the row avatar uses the same comet glow as
running board cards. The row `...` menu replaces the count chip on hover
and keyboard focus. It keeps the count chip hidden while open. The first-level
menu shows Rename, Change color, Delete; Change color opens the color picker
submenu.

**Multiplayer (Teams v2).** The **Organization** entry
(`ORGANIZATION_VIEW_ID = "organization"`) renders only when
`canSeeOrganization(capabilities)` (multiplayer owner/admin); hidden for plain
members and single-player. **New Agent** is gated on `canCreateAgents`
(`useCanCreateAgents`) — a member with no create right gets no add action. Full
client model: `knowledge-base/teams.md`.

## Provider + model wiring

> **Connecting/disconnecting a provider is the AI Hub's job now, not Settings'** —
> see "AI models hub" below. Settings no longer has a provider section. This
> section is the workspace **pin** (which provider+model a session runs on) and
> the provider catalog, which the hub and the chat model picker both read.

Each workspace pins a provider + model. Set via `PATCH /v1/workspaces/:id/provider`,
read by every session start. Frontend catalog: `app/src/lib/providers.ts`.
Backend registry: `engine/houston-terminal-manager/src/provider/` (one file per
adapter, see `knowledge-base/architecture.md`).

| Provider id | CLI | Default model | Premium model | Login flow |
|---|---|---|---|---|
| `anthropic` (alias `claude`) | `claude` (runtime download) | `claude-sonnet-4-6` | `claude-opus-4-8` | OAuth via `claude auth login --claudeai` |
| `openai` (alias `codex`) | `codex` (bundled) | `gpt-5.5` | `gpt-5.5` (frontier; no separate tier) | OAuth via `codex login` |
| `gemini` (alias `google`) | `gemini` (bundled, macOS only) | `gemini-2.5-flash` | `gemini-2.5-pro` | API key, no CLI login (see `knowledge-base/auth.md`) |

Notes:
- OpenAI ships four models in the picker: `gpt-5.5` (default, frontier),
  `gpt-5.4` (everyday coding), `gpt-5.4-mini` (small/fast/cheap), and
  `gpt-5.3-codex-spark` (ultra-fast). gpt-5.5 is both default and frontier, so
  the "Premium model" column repeats it. The full catalog (labels, per-model
  context windows, effort levels) lives in `app/src/lib/providers.ts`; codex
  itself enumerates them in `~/.codex/models_cache.json`. The model string is
  passed verbatim to `codex --model`, so the engine never validates against a
  fixed list. The phantom `gpt-5.5-codex` / `gpt-5-codex` coding SKUs are NOT
  selectable (ChatGPT accounts reject them; see `openai_classify.rs`).
- Gemini has no `gemini login`. The picker short-circuits on
  `loginKind === "apiKey"` and opens the Connect-API-Key dialog
  (`app/src/components/shell/api-key-connect-dialog.tsx`). Calling
  `/v1/providers/gemini/login` directly returns `BadRequest`.
- Gemini is macOS-only in v1; Windows users see it as unavailable until
  the phase-2 fork-build lands (see `knowledge-base/cli-bundling.md`).
- Adding a fourth provider = one new adapter file + one registry entry +
  three dispatch arms (runner, parser, summarizer). See "Engine boundary"
  in `CLAUDE.md`.
- _[NEW ENGINE only]_ The TS engine (pi runtime) adds **OpenCode Zen**
  (`opencode`), **OpenCode Go** (`opencode-go`), **OpenRouter** (`openrouter`),
  **Google Gemini** (`google`), **Amazon Bedrock** (`amazon-bedrock`), and
  **MiniMax global** (`minimax`, not `minimax-cn`) as **API-key** providers. pi
  ships them as built-ins, so there is no Rust adapter
  file and no CLI. The user pastes a key (dialog has a "Get your API key" button);
  it's stored as a connect-once `kind:"api_key"` workspace credential. Bedrock is
  special only at the runtime edge: the stored key is mirrored from pi-coding-agent's
  generic `apiKey` option to pi-ai's Bedrock-specific `bearerToken` option in
  `packages/runtime/src/ai/bedrock.ts`. The frontend catalog gates these behind
  `newEngineActive()` so the Rust build never shows them. Full design:
  `convergence/README.md` standing decisions. Runtime registry:
  `packages/runtime/src/ai/providers.ts`; host catalog:
  `packages/host/src/providers.ts`.
- _[NEW ENGINE only]_ **One connect card for both OpenCode gateways** (HOU-577).
  Zen and Go are two distinct pi gateways (`opencode.ai/zen/v1` vs
  `opencode.ai/zen/go/v1`, disjoint model catalogs) but authenticate with the
  SAME opencode.ai key — pi reads `OPENCODE_API_KEY` for both. So the connect
  surfaces (settings + onboarding picker) show ONE "OpenCode" account card
  (`getConnectProviders` collapses the two catalog entries; `gatewayIds` lists
  both), and the adapter fans the pasted key out to both gateway ids
  (`credentialSiblings` in `synthetic.ts`; `setProviderApiKey`/`providerLogout` in
  `client.ts` loop over it — ONE `ProviderLoginComplete`, one active provider).
  Status is OR'd across the gateways (`tauriProvider.checkMergedStatus`). The
  chat **model picker keeps Zen and Go as separate sections** (it maps `PROVIDERS`
  directly) — the model picked selects the gateway; opencode.ai enforces
  Go-subscription vs Zen-credit entitlement per request (surfaced as a
  provider-error card), so Houston never has to detect the plan from the key.
- _[NEW ENGINE only]_ The TS engine also adds **GitHub Copilot**
  (`github-copilot`) as a **subscription OAuth** provider — pi-ai ships it
  built-in (no adapter, no CLI), so it's registry entries only across the same
  runtime + host catalogs. Login is a GitHub **device-code** flow; its pi-ai
  login opens with an optional "GitHub Enterprise URL/domain" prompt that
  `login.ts` `autoPromptAnswer(provider, domain?)` answers programmatically
  (`""` ⇒ github.com for individual, or the company domain for Enterprise) to
  avoid a deadlock. Curated models proxy Claude/GPT/Gemini under one
  subscription, using pi-ai's DOTTED Copilot ids (`claude-sonnet-4.6`, not the
  native `claude-sonnet-4-6`). LOCAL-only (cloud egress isn't allowlisted).
  **Plan gating (HOU-578):** Copilot's premium models (Claude, GPT-5.x) require
  Copilot **Pro** — on **Copilot Free** (`sku=free_limited_copilot`) the editor
  API serves only BASE models (gpt-4.1 / gpt-4o) and answers any premium model
  with `400 model_not_supported` (independent of the API host / endpoint / the
  per-model `policy` accept — all verified). So the default Copilot model is
  **`gpt-4.1`** (a base model every plan serves; `config.githubCopilotModel`),
  and the runtime classifies `model_not_supported` → a typed `model_unavailable`
  provider error (`ai/provider-error.ts`) that renders the switch-model card with
  `gpt-4.1` as the suggested fallback. Pro users switch up to Claude in the picker.
- _[NEW ENGINE only]_ **GitHub Copilot Enterprise** (company-provided Copilot) is
  NOT a separate card — pi has one Copilot provider/slot, so the SINGLE
  `github-copilot` card's connect opens a **Personal vs Company** dialog
  (`provider-copilot-connect-dialog.tsx` via `useCopilotConnect`). Company collects
  the firm's GitHub domain and threads it as a non-secret `enterpriseUrl` through
  the credential path + central refresh (so refresh hits
  `api.<domain>/copilot_internal/v2/token`); Personal passes no domain (github.com).
  One card + one slot means no per-card status disambiguation. Full design:
  `convergence/README.md`.

### The chat model picker (minimal two-level menu)

The composer's model picker is a **minimal two-level command menu**
(`@houston-ai/core` `ModelPicker`, built on cmdk). **Level 1** lists ONLY the
connected providers (brand glyph + name, a check on the currently-selected
model's provider) plus a quiet **"Connect more providers…"** footer. Clicking a
provider drills into **level 2**: a back affordance + that provider's model rows
(name, a subtle one-line description, a check on the selected model). An
always-visible **search field** at the top bypasses the levels with a flat
ranked list across all connected providers; clearing it returns to the current
level. Keyboard: cmdk roving (↑↓/Enter), Escape clears an active query then steps
back from level 2, Backspace-on-empty-query steps back. Sizes to content
(`max-h-[360px]` scroll). The library component is props-only and i18n-agnostic
(`labels?`); all app wiring lives in `app/src/components/chat-model-selector.tsx`.

- **Disconnected providers never appear.** The picker filters to
  `connection === "connected"` for both the level-1 list and search; the ONLY
  path to a disconnected provider is the "Connect more providers…" footer, which
  navigates to the AI Hub (`setViewMode("ai-hub")`). The old per-row Connect
  buttons, provider rail, favorites/recents groups, FilterPopover, SortMenu,
  result-count row, and model detail panel were all **deleted** in the minimal
  redesign. Pure selectors + the nav reducer live in
  `ui/core/src/components/model-picker/{catalog,nav}.ts` (unit-tested in
  `ui/core/tests/`).
- **#342 flicker guard.** While provider statuses (or the catalog) are still
  resolving and nothing is connected yet, level 1 shows a neutral loading state,
  never "no providers" — `providerListLoading()` in `catalog.ts`,
  `providerPickerState(...)` still yields `checking` app-side
  (`app/src/lib/model-picker.ts`).
- **Curated-first ranking.** The pi catalog's raw order is often oldest-first,
  so `chat-model-picker-map.ts` re-ranks each provider's rows via
  `rankCuratedFirst`: models with a `PROVIDER_OVERRIDES[provider].models` entry
  lead, in override key (curation) order, then the rest in catalog order; curated
  rows carry `curated: true`. Search (`searchModels` in ui/core `catalog.ts`)
  ranks by match tier (name match beats other-field), then the `curated` flag,
  then match position, then input order — so "opus" surfaces Opus 4.8/4.7 above
  Claude Opus 3.

- **Reused in the import-agent wizard too.** `ChatModelSelector` is the ONE model
  selector: the chat composer AND the import flow (`portable/import-wizard.tsx`)
  render it with `agent={null}` (never locks — there is no agent yet). The old
  hand-rolled `InlineModelSelector` (curated-only, hid disconnected providers) is
  gone. The **create-agent dialog has NO model picker**: `naming-step.tsx` and
  `ai-assist-step.tsx` silently use the sticky last-used provider/model
  (loaded on dialog open in `create-workspace-dialog.tsx`, baked into the new
  agent via `finishAgentSetup`); users change the model later from the chat
  composer.
- **Only ever offers runnable `(provider, model)` pairs.** The mapping
  (`app/src/lib/chat-model-picker-map.ts`, pure + unit-tested) encodes each row
  id as `` `${provider}::${model}` `` (split on the FIRST `::`), decoded on
  select back into the existing `handleModelSelect(provider, model)` — so the
  cross-provider `ProviderSwitchDialog` consent, effort selector, and all
  persistence are untouched. The effort control stays a SEPARATE composer button.
- **Open-catalog providers accept any live id (don't revert it).**
  `validModelOrNull` (`app/src/lib/providers.ts`) would null any model not in a
  provider's curated `PROVIDERS[].models`, so the effective-model chain
  (`validModelOrNull(...) ?? ... ?? getDefaultModel`) silently reverted a live
  OpenRouter pick to the default. `isOpenCatalogProvider(providerId)` (currently
  `openrouter` + the local `openai-compatible`) now short-circuits that check so
  a live id passes through — mirrors the domain's pass-through set (providers
  absent from `VALID_MODELS`). Caveat: the RUNTIME still resolves ids through
  pi-ai's generated registry (~259 openrouter models), so a brand-new live id
  outside that registry persists but fails the turn at `safeGetModel`
  (`packages/runtime/src/ai/providers.ts`) with a clean "model not available"
  error — closing that tail needs pi-ai pass-through model construction.
- **pi-ai's `/v1/catalog` is the source of truth.** `GET /v1/catalog`
  (`packages/host/src/routes/catalog.ts` + `providers/pi-catalog.ts`) returns the
  wire `ProviderCatalog` (`@houston/protocol` `provider-catalog.ts`): every
  runnable provider (~35 / 979 models — the SAME full set on every deployment,
  desktop and managed pod; no profile gating) with each model's
  pricing/context/maxTokens/reasoning/vision and
  `thinkingLevels`. Built from pi-ai's **baked in-process registry** (no egress,
  no key) — so the set is **runnable-by-construction** (a model is offered iff pi
  can run it) and identical on desktop and inside a pod. Effort levels derive from
  pi `thinkingLevels`. `use-provider-catalog.ts` is the SOLE owner of the
  `["provider-catalog"]` query: it calls `getEngine().getCatalog()` directly (NOT
  the toasting `call()` wrapper, so it renders its own friendly toast instead of a
  raw "engine error 404") and hydrates the `PROVIDERS` cache from the result
  (`providers.ts`). A failure is NEVER swallowed: the adapter's `getCatalog` no
  longer degrades a 404 to `[]` (every current host and the e2e fake host serve
  the route, so a 404 means a stale host), it throws, and the hook surfaces both
  an error AND a 200-but-empty payload as a `providers:toast.catalogLoadFailed`
  toast while the seed keeps the UI rendering. (Silently emptying the picker is the
  bug that shipped v0.5.2 with providers but zero models.) `useHubCatalog()` derives
  its view from this same query rather than registering a second observer; the old
  `tauriProvider.getCatalog` is deleted.
  **The live-OpenRouter fetch is RETIRED** — the old
  `GET /v1/providers/openrouter/models` route + `openrouter-catalog` mapper + the
  `LiveCatalog` wire type + `listProviderModels`/`listModels` adapter are deleted.
- **One view-model, curated rows only.** Every provider's rows come from the
  hydrated `PROVIDERS` catalog (seeded by `/v1/catalog`). Each picker row carries
  only `{ id, providerId, name, description }` — the models.dev capability/price
  enrichment the old detail panel needed was **dropped from the chat picker**
  (`chat-model-picker-enrich.ts` deleted; `chat-model-picker-map.ts` no longer
  takes a `catalog`). The models.dev snapshot + `capabilitiesOf`/`priceTier`
  (`app/src/lib/ai-hub/capabilities.ts`) still power the **AI Hub**. The picker's
  `catalogState` ("loading"|"ready") comes from the pi-ai catalog readiness
  (`useProviderCatalog`), driving the neutral level-1 loading state.
- **Favorites & recents storage is retained but no longer surfaced.** The
  per-user prefs (`favorite_models` / `recent_models`) and
  `app/src/hooks/use-model-favorites.ts` (`useModelFavorites()`) still exist, but
  the picker renders neither favorites nor recents anymore, and
  `use-chat-model-picker.tsx` no longer reads/writes them.
- **Connecting from the picker.** The "Connect more providers…" footer navigates
  to the AI Hub (`onConnectMore` → `setViewMode("ai-hub")`, closing the popover),
  the one surface that lists every provider and owns the full connect flow. The
  old inline per-provider connect stack (`ProviderConnectionDialogs` +
  `useProviderConnections` inside the picker) is gone.

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

The size decision (`app/src/lib/provider-switch.ts::decideHandoffMode`) reads
the SAME per-model context-window numbers the runtime's autocompact uses:
`resolveModelWindow` / `effectiveModelWindow`
(`@houston/protocol/model-windows`, a dependency-free subpath export) is the
ONE `{default, max}` table, imported by both the frontend catalog
(`app/src/lib/providers.ts`) and the runtime
(`packages/runtime/src/session/exec-turn.ts`, autocompact + provider-switch
sizing) — the context bar and the engine's compaction trigger always divide by
the same denominator now. `default` is the starting estimate; the estimate
snaps UP to `max` once observed usage exceeds `default`, proving the larger
(plan/credit-gated) window is actually active. Anthropic's flagships
(`claude-sonnet-4-6`, `claude-opus-4-7`, `claude-opus-4-8`) default to 200k and
snap to 1M. `normalizeUsage` (`packages/runtime/src/backends/pi/wire.ts`)
synthesizes `context_tokens` from the component fields when a provider's usage
event omits a summed `totalTokens`, so a provider that under-reports usage
still feeds the window estimate instead of going null. The choice is staged in
`app/src/stores/provider-switch.ts`, forwarded on the
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

Four tiers, ascending: `low`, `medium`, `high`, `xhigh` (`EffortLevel` in
`app/src/lib/providers.ts`). A fifth `max` tier used to sit above `xhigh`; it
produced the byte-identical request as `xhigh` on every provider (a label with
no effect), so it was removed. A persisted `"max"` (an older agent config; the
JSON schema `ui/agent-schemas/src/config.schema.json` and
`app/src/data/config.ts` still list it in the type for that reason) normalizes
to `"xhigh"` on read (`normalizeEffort`); the runtime's own wire mapping
(`toThinkingLevel`, `packages/runtime/src/ai/effort.ts`) also still accepts
`"max"` and maps it to `xhigh`, so an unmigrated agent's turns run correctly
even before the value is re-picked in the UI.

Effort is **per-agent and model-gated**. Stored as `effort` in the agent's
`.houston/config/config.json`, set from the model picker
(`app/src/components/chat-model-selector.tsx`), which shows only the levels
the active model accepts (`getEffortLevels`). `validEffortOrDefault` resolves
the level actually used: the requested value if the model accepts it, else
`DEFAULT_EFFORT` (`medium`) if the model offers it, else the model's lowest
level; a model with no effort control gets `undefined` and the flag is omitted
entirely.

**Per-model levels derive from pi by default, not a hand-maintained table.**
`deriveEffortLevels` (`app/src/lib/providers.ts`) maps each model's pi-ai
`thinkingLevels` (pi's `getSupportedThinkingLevels`, vendored
`@earendil-works/pi-ai`, surfaced via `/v1/catalog`) straight onto Houston's
four-tier scale, dropping pi's `off`/`minimal` (Houston's scale starts at
`low`). This keeps the effort set honest as pi adds/changes models, with no
curated list to fall out of date. `PROVIDER_OVERRIDES[].models[id].effortLevels`
(`app/src/lib/provider-overrides.ts`) is an escape hatch ONLY for a genuine
gateway-imposed cap that differs from what pi reports — no override sets it
today. If one is added naming a model id the shipped pi-ai catalog doesn't
carry, `app/tests/provider-overrides-drift.test.ts` fails the build (it reads
the real vendored pi-ai registry, not a test fixture).

### Turn mode

A separate per-turn "Mode" pill sits next to the model + effort controls in
the composer footer, with three labels — **Planner** (`plan`, read-only
investigation), **Coworker** (`execute`), and **Autopilot** (`auto`,
fire-and-forget: no blocking tools). Unlike
effort it is NOT synced through `Settings` — full mechanics, the runtime
enforcement (tool clamp + overlay), and the "forgotten `modeOverride`
silently degrades to execute" gotcha are in `knowledge-base/architecture.md`
("Turn modes").

## AI models hub

The **AI Hub** is a top-level sidebar view ("AI models", `viewMode "ai-hub"`) that
replaced the old Settings → AI provider section. It is a provider/model
marketplace, not a settings pane. Entry: `app/src/components/ai-hub/ai-hub-view.tsx`
(`AiHubView`), rendered by `workspace-shell.tsx` like any other top-level view.

**Four surfaces, one view:**
- **Provider grid** — the shared `ProviderBrowser`
  (`components/provider-browser/provider-browser.tsx`, rows in
  `provider-browser/provider-row.tsx`, grouped by
  `provider-browser/provider-grouping.ts`): brand-colored cards in Connected /
  Available sections, featured pinned first, with the search + quick-filter bar.
  The SAME component renders onboarding's connect step, the migration reconnect
  screen, and workspace setup (they pass `onSelect`/`selectOnMount`; the hub
  passes `onOpen` + `renderDialogs={false}`). Coming-soon tiles are gone.
- **Provider detail** (`provider-modal.tsx`): connect / sign-out plus that
  provider's model list.
- **Model directory** (`model-directory.tsx` → `models-browser.tsx` /
  `model-card-row.tsx`): the cross-provider catalog (~378 unique models) as a
  `sm:grid-cols-2` card grid (BrandMark + name + lab + a visible "See more" cue),
  above a control row of a pill search box + four facet comboboxes — AI provider
  (self-hides at one lab), Good at, Cost, Memory. The comboboxes are the shared
  `ai-hub/filter-combobox.tsx` (Popover + cmdk, optional in-dropdown search),
  which the teams allowed-models editor's `agent-admin/lab-filter.tsx` also
  reuses. Cost/Memory buckets are the pure `costBucket` / `memoryBucket` in
  `ai-hub/format.ts` (cost reuses the `costTier` thresholds, plus a `$0` "Free"
  bucket; memory splits at 200K / 1M). Searchable via `ai-hub/search.ts`. The
  old Mercury ledger (`models-ledger.tsx` / `model-row.tsx` / the sticky
  `LedgerHeader` + `DirectoryFilters`) was removed. `ModelsBrowser` also backs
  the provider modal, so both surfaces read identically.
- **Model detail** (`model-modal.tsx` + `model-offer-row.tsx`): one model's
  per-provider offers ("Get it through" + pricing / subscription).

Navigation is local `useState<HubLocation>` inside `AiHubView` (roots
`providers` / `models` carry the hero + tabs; `provider` / `model` are drill-ins).
The navigation shell is surface-specific idiom and stays uninventoried; only the
three reusable content components are in `design/inventory` (see below).

### The catalog

Data lives in `app/src/lib/ai-hub/**`. The directory is built at runtime by
`loadHubCatalog(visibleProviderIds)` (`catalog.ts`) from **two** sources:

1. **A checked-in models.dev snapshot** — `app/src/lib/ai-hub/model-catalog.json`,
   generated by `node scripts/generate-model-catalog.mjs` (re-run to refresh; set
   `MODELS_DEV_JSON` to a local `api.json` for an offline/pinned run). It keeps
   only the providers Houston routes to and only the fields the hub renders. Every
   model gets a normalized cross-provider `key` (via `normalizeKey`) so the same
   model across Anthropic / Bedrock / Copilot / OpenCode / OpenRouter folds into
   one directory entry. The timestamp is a content hash, not wall-clock, so a
   re-run on unchanged source is byte-identical (clean diffs). `opencode-go`'s
   models are folded into the `opencode` bucket at generation time.
2. **The curated `PROVIDERS` catalog** (`app/src/lib/providers.ts`), merged in at
   runtime with the snapshot specs.

**The OAuth-curated vs gateway-full-list rule** (`catalog.ts`):
- **API-key gateways** (`opencode`, `openrouter`, `deepseek`, `google`,
  `amazon-bedrock`, `minimax`) contribute their **full** snapshot model lists —
  any model the gateway serves is an offer.
- **Subscription / OAuth providers** (`openai`, `anthropic`, `github-copilot`)
  contribute **only their curated `PROVIDERS.models`** (enriched with snapshot
  specs), because the plan can only run that curated set — never the full list.

Which providers are visible is gated by `getVisibleProviders` /
`getConnectProviders` (`providers.ts`): new-engine + desktop + host `capabilities`
gating, with the two OpenCode gateways collapsed into one "OpenCode" connect card.
The hub's directory counts offers only from that visible set. Merge internals
(cross-provider key folding, capability-flag OR-ing, offer building) are in
`catalog-merge.ts`; the React entry is `use-hub-catalog.ts`. Catalog types:
`catalog-types.ts`.

### `useProviderConnections` — THE way to build provider-connection UI

`app/src/hooks/use-provider-connections.ts` (+ `app/src/hooks/provider-connections/*`)
is the single shared layer for connect / sign-out. It was extracted verbatim from
the now-deleted `provider-settings.tsx` so no connection logic lives inline in a
view. **Any surface that connects/disconnects a provider drives this hook** —
don't re-implement status probing, the OAuth event relay, or connect actions.
It owns provider status (tri-state), the connect/cancel/sign-out actions, the
pending/busy map, and the dialog state; `ProviderConnectionDialogs`
(`components/ai-hub/provider-connection-dialogs.tsx`) renders the dialog stack
once from `connections.dialogProps`. The hub view renders both once and passes
`connections` down to every card and offer row. Desktop drops `ProviderLoginUrl`
dialogs (co-located browser callback); see `knowledge-base/auth.md` for the
connect/re-auth event contract.

### Where a provider connect executes (agent runtime vs setup runtime)

Credentials are **workspace-central** (connect-once): a captured credential
lands on the personal workspace and every agent runtime is served from it
(`/sandbox/credential`). But the OAuth dance itself still needs a runtime to
run in, so the web adapter's `providerEngine()` routes the connect surface
(status, login, complete, cancel) by the persisted selection pref
`houston.pref.last_agent_id`:

- pref names an agent → that agent's runtime (`/agents/:id/auth/...`);
- pref absent → the host's hidden **setup runtime** (`/setup-runtime/auth/...`,
  `packages/host/src/routes/setup-runtime.ts`) — the pre-agent first-run path.

**Invariant: the pref never names an agent the control plane doesn't have.**
The adapter prunes it in cp `listAgents` (boot runs that before any connect
surface mounts) and clears it in cp `deleteAgent` when the deleted agent was
the remembered one (`packages/web/tests/stale-agent-pref.test.ts`). A stale
pref (deleted last agent, wiped `~/.houston` with surviving localStorage,
account switch) used to send first-run onboarding logins to
`/agents/<dead>/auth/:pid/login` → 404 "agent not found".

### Removed / moved

- **Settings no longer manages providers.** Deleted: `provider-settings.tsx`,
  `settings/sections/provider.tsx`, `shell/provider-account-row.tsx`, and the
  settings-view provider section. All connect UI is the hub.
- Top-level views share one set: `app/src/lib/top-level-views.ts`
  (`TOP_LEVEL_VIEWS = {dashboard, settings, ai-hub}`, `isTopLevelView`) — both
  `sidebar.tsx` and `workspace-shell.tsx` source from it so a new top-level view
  can't be wired into one and forgotten in the other.
- i18n: namespace `aiHub` (`app/src/locales/{en,es,pt}/ai-hub.json`, registered in
  `app/src/lib/i18n.ts`).
- `design/inventory` bumped to **v2**: three new cross-surface content components
  (`ai-provider-card`, `ai-model-row`, `ai-model-offer-row`), web=`partial`
  (app/-locked in `components/ai-hub/`, extract to `ui/` before mobile).

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

Status transitions: when a turn settles, the SDK persists the board status through the `persistBoardStatus` seam (the web adapter PATCHes `{ status, pending_interaction }`) — a clean turn with nothing outstanding → `done`; a turn that ended on `ask_user`/`request_connection` → `needs_you` carrying the pending interaction; a handled Stop / logged-out provider → `needs_you`; a real failure → `error`. The resulting `ActivityChanged` event auto-invalidates TanStack Query → board refreshes. (The `done`-vs-`needs_you` split and the `sessionStatus`/`boardStatus` pair: `knowledge-base/client-architecture.md`; full interaction lifecycle: `knowledge-base/architecture.md`.)

Columns can have `onAdd` callback → renders "+" button for creating activities from board.
