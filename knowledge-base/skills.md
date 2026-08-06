# Skills

A Skill is a reusable procedure stored as a markdown file with YAML frontmatter. Houston shows them in the picker, the chat empty state, and the per-agent Skills tab.

> **Updated: Houston runs on the TypeScript host now — the Rust `engine/` was removed.** SKILL.md format, discovery, and UI behavior below are current, but `engine/houston-skills` / `houston-engine-core` crate names and `.rs` paths are historical: skills are now parsed in the **host** and loaded by the **pi runtime** (`packages/runtime/src/session/resource-loader.ts`).

## File layout

```
.agents/skills/<slug>/SKILL.md       # source of truth, YAML frontmatter + body
.claude/skills/<slug>                # live link → ../../.agents/skills/<slug>
                                     # auto-created by engine on `list_skills`
```

The `.claude/skills/<slug>` discovery node is what makes a skill visible to
Claude Code natively. On Unix it is a relative symlink. On Windows a real
symlink needs Developer Mode or admin (os error 1314), so the engine falls back
to a **directory junction** — privilege-free and, crucially, *live*: it always
reflects the source `SKILL.md`, so a skill the agent later rewrites never goes
stale behind the mirror. A plain copy is the last resort for the rare non-NTFS
volume that rejects junctions. See `ensure_claude_mirror` in
`engine/houston-engine-core/src/skills.rs`.

Houston Store agent packages may also include `.agents/skills/*`.
Install copies the package to `~/.houston/agents/<id>/`; creating a
workspace agent from that definition copies those packaged skills into
the user's agent root so Skills appear in chat immediately. The picker
only selects the workflow; the chat composer stays visible so the user
can add free-form context, or send the Skill by itself and let the
agent ask for missing details.

The body is a regular markdown file Claude Code uses as the procedure when the Skill runs. The frontmatter drives both **tool discovery** (Claude reads `name` + `description`) and current **UI rendering** fields such as category, featured, image, and integrations.

## Frontmatter schema

Source of truth: `engine/houston-skills/src/lib.rs` (`SkillSummary`). Parsed by `serde_yml`, so anything valid YAML works.

```yaml
---
# Identity (required)
name: research-company             # slug, kebab-case
description: Deep-dive on pricing  # one-liner Claude uses for tool matching

# Display (optional)
title: "Investigar una empresa"    # human title shown on cards; carries the
                                   # accents/casing the ASCII slug can't.
                                   # Missing → UI humanizes the slug.

# Bookkeeping (optional, set by engine on create)
version: 1
created: 2026-04-25
last_used: 2026-04-25

# Picker presentation (optional)
category: research                 # preview-modal category chip
featured: yes                      # showcase on chat empty-state cards
image: magnifying-glass-tilted-left
                                   # Fluent emoji slug (flat 2D) OR full https URL
integrations: [tavily, gmail]      # Composio toolkit slugs (lowercase)
---

## Procedure
Step-by-step instructions Claude follows when the Skill runs.
```

### Field details

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `name` | string | — | Required slug. Drives the file path + Claude's tool name. |
| `title` | string | unset | Display phrase (accents/casing). UI shows `title ?? humanize(slug)`; loading always resolves by the directory slug, so a drifting title can never 404. |
| `description` | string | `""` | One line. Claude semantically matches user intent against this. **Specific = reliable invocation.** |
| `version` | int | `1` | Engine increments on edit. |
| `created` / `last_used` | string | unset | YYYY-MM-DD. Engine maintains. |
| `category` | string | unset | Preview-modal category chip. |
| `featured` | bool | `false` | Accepts `yes` / `true` / `1` / `on`. Surfaces on the empty-chat showcase. |
| `image` | string | unset | Either an `https://...` URL OR a Fluent Emoji slug (rendered as the flat 2D variant) (lowercased folder name from [microsoft/fluentui-emoji/assets](https://github.com/microsoft/fluentui-emoji/tree/main/assets), spaces → dashes). Resolved frontend-side via `resolveSkillImage`. |
| `integrations` | string[] | `[]` | Composio toolkit slugs. Drives the logo row on every skill surface (see "Connected apps on skill surfaces"). |

## Connected apps on skill surfaces (`integrations:`)

The frontmatter's `integrations:` slugs are rendered on **four** surfaces, all
from one normalizer and two shared app components (HOU-794):

- `app/src/lib/skill-integrations.ts` — `skillIntegrationSlugs()` trims,
  lowercases, drops blanks and dedupes the hand-authored YAML list, preserving
  author order. The Composio catalog is keyed by lowercase slug, so an
  un-normalized `Gmail` silently misses it and degrades to the favicon guess.
  Pure, node:test-covered (`app/tests/skill-integrations.test.ts`).
- `app/src/components/integrations/integration-chips.tsx` — `IntegrationChips`,
  the 16px logo pips + "+N" overflow (renamed from `AgentIntegrationChips` and
  moved into `integrations/`; the new-agent store cards use the same component).
  Pips resolve through `appDisplay` + `useToolkitBySlug` and reuse `AppLogo`
  (new `xs` size) for its per-URL failure latch; each pip's tooltip is the app's
  REAL name, never the slug.
- `app/src/components/integrations/integration-badges.tsx` — `IntegrationBadges`,
  the richer Badge + logo + name row for detail surfaces, extracted from
  `store-view/store-detail-dialog.tsx` and now shared with the skill edit modal.
- `app/src/components/skill-integration-chips.tsx` — `skillIntegrationChips()`
  returns the chips node **or `undefined`**, because every host puts it in an
  optional slot with its own spacing; a skill with no integrations must lay out
  exactly as before.

| Surface | Component | Where |
|---|---|---|
| Skill cards (chat empty state) | pips in `SkillCard`'s `footer` slot | `use-agent-chat-panel.tsx` |
| Installed-skill rows (Skills tab, chat picker) | pips in `SkillCatalogRow`'s trailing slot, before the chevron (cap 3) | `skills/skill-catalog-rows.tsx` |
| Skill edit modal | named badges under the description | `tabs/skill-editor-dialogs.tsx` → `SkillEditModal`'s `integrationsSlot` |
| Marketplace preview modal (skills.sh) | named badges under the description, from the preview's `integrations` | `tabs/skill-discovery-tabs.tsx` → `SkillMarketplaceSection`'s `renderIntegrations` → `SkillPreviewModal` |
| Chat skill invocation card | pips under the description | `user-skill-message.tsx` (from the marker's `integrations`) |

`SkillEditModal` (`ui/skills/`) stays props-only: it takes `integrationsSlot?:
ReactNode`, never slugs, because resolving a slug to a name/logo is a
Composio-catalog concern that belongs to `app/`. Its heading copy is
`skills:detail.integrations` ("Works with"). The modal was split to hold the
200-line law: `skill-edit-modal-labels.ts` (labels + defaults) and
`skill-edit-modal-parts.tsx` (the body/footer states).

## How skills reach the model (both backends)

Skill INVOCATION is just a user message (`Use the <skill> skill.` — see the
marker section below), so the model must already know what skills exist and
where their files live. Each runtime backend surfaces that index in its system
prompt:

- **pi backend** (every non-Anthropic provider): `DefaultResourceLoader`
  (`packages/runtime/src/session/resource-loader.ts`) loads
  `<workspace>/.agents/skills` (or `HOUSTON_SKILLS_DIR`) and pi's own
  system-prompt builder appends an `<available_skills>` XML section — each
  skill's `name`, `description`, and the absolute SKILL.md `<location>` — plus
  the instruction to Read the file when the task matches.
- **Claude backend** (Anthropic provider, the Claude Agent SDK subprocess):
  the SDK's native skill machinery is deliberately OFF (`settingSources: []`,
  `Skill` in `disallowedTools` — nothing on disk may leak in), so
  `buildSystemPrompt` (`packages/runtime/src/backends/claude/system-prompt.ts`)
  appends the IDENTICAL `<available_skills>` section itself, reusing pi's
  exported `loadSkillsFromDir` + `formatSkillsForPrompt` on the same directory.
  Before HOU-894 this section was missing entirely: an Anthropic session had no
  idea what skills existed, so "Use the <skill> skill." turns ran blind —
  agents improvised the procedure, spun for minutes, and never completed
  (the legacy Rust engine never had this gap; its claude CLI discovered the
  `.claude/skills` mirror natively).

Loader parity rule (pi's, now both backends): a SKILL.md with **no
`description:` frontmatter is silently dropped from the index** — the model
never learns it exists, even though the Skills UI still lists it. Keep
`description` mandatory in anything that writes skills.

## Finding a skill from chat (`find_skills` / `install_skill`, PRODUCT-1238)

"Is there a skill for X?" is answered by the agent itself, not by sending the
user to browse the Skills page. Two tools, on by default in EVERY agent:

- **`find_skills(query)`** — searches skills.sh and returns candidates with
  their real descriptions and install counts.
- **`install_skill(source, skillId)`** — installs one into the calling agent's
  `.agents/skills/` tree.

**Why native tools and not Vercel's `find-skills` skill installed everywhere.**
That skill (2.8M installs, the one the issue pointed at) is a procedure whose
every step is a CLI call (`npx skills find`, `npx skills add -g -y`). Three
things break here: pi ships **no tool CLIs**, `npx skills add` writes to
`~/.claude` rather than the `.agents/skills/` tree pi's loader reads, and the
product prompt forbids naming a CLI to a non-technical user. Everything that
skill does over the CLI, the host already did in-process for the Skills UI — so
the capability is native, needs no per-agent install, and no manifest entry.

**The wiring** (mirrors `save_learning` exactly — read that first):

| Layer | Where |
|---|---|
| Tools | `packages/runtime/src/session/tools/find-skills.ts` |
| Name allowlist + mode reach | `packages/runtime/src/session/tool-selection.ts` (`skillDirectory` gate) |
| pi registration | `packages/runtime/src/session/conversation-cache.ts` |
| Claude backend mirror | `packages/runtime/src/backends/claude/custom-tools.ts` |
| Host routes | `packages/host/src/routes/skills-sandbox.ts` (`POST /sandbox/skills/{search,install}`) |
| Prompt guidance (BOTH copies) | `packages/host/src/houston-prompt.ts` + `app/src-tauri/src/houston_prompt/skills_memory.rs` |

Four things that are load-bearing:

1. **Gate = host reachability**, the same one `save_routine` / `save_learning`
   use — not a Composio key and not a feature flag. The directory lives behind
   the host, so the tools exist wherever the sandbox token reaches it.
2. **Reach is execute + auto, never plan.** Finding is a read, but installing is
   a real write, and a plan turn that could find a skill it cannot add would
   just dead-end.
3. **The token names the agent, the request body cannot.** An install can only
   ever land in the tree of the agent the sandbox token resolves to.
4. **A mid-turn install is invisible to the model.** `<available_skills>` is
   built at session start, so `install_skill` returns the SKILL.md **path** and
   tells the agent to Read it if it's running the skill in this same turn.

Search hits are enriched with real descriptions via the shared `PreviewDirectory`
(top 5 only — each is a cached GitHub SKILL.md lookup). Enrichment is
best-effort **per hit**: an unreachable SKILL.md still returns as a candidate
without a description rather than failing the whole answer. Both the search and
preview caches are the SAME process-wide singletons the marketplace UI uses
(exported from `skills-directory.ts` as `communityDirectory` / `previewDirectory`)
— two instances would double the outbound rate against a service that
rate-limits, and the request spacing that keeps us under it is per-instance.
`CommunityDirectory` captures its fetch at construction, which is why the route
takes the directory itself as the test seam rather than a `fetchImpl`.

## Render pipeline

1. **Engine** parses SKILL.md frontmatter via `serde_yml` (`engine/houston-skills/src/format.rs`). Unknown fields are silently ignored — old skills with `icon:` / `starter_prompt:` still parse.
2. Engine returns the full `SkillSummaryResponse` on `GET /v1/skills`.
3. **App** (`useSkills` query → `tauri.ts` → `engine-client`) maps the snake/camel-case wire shape back to app's `SkillSummary`.
4. **Skill cards** use `app/src/components/skill-card.tsx` only for the chat empty-state showcase. The Skills tab and New Mission picker share `skills/skill-catalog-rows.tsx`: `SkillCatalogRow` renders the installed catalog row, while `SkillCatalogGrid` supplies its list. Both surfaces filter with `filterInstalledSkills` and sort with `sortSkillsByTitle`, so display titles, including accented frontmatter titles, determine A-Z order. **First-party store skills ship fully translated** (en/es/pt SKILL.md trees; a Spanish workspace seeds Spanish skills, the agent runs the Spanish procedure, editing is in Spanish). Display names come from the frontmatter `title:` field via `skillDisplayTitle` (accents the ASCII slug can't carry), falling back to `humanize(slug)`. See `knowledge-base/i18n.md` § "Store skills are translated at the CONTENT level".
5. **`useAgentChatPanel`** (`app/src/components/use-agent-chat-panel.tsx`) — single source of truth for the per-agent panel UX. Owns:
   - skill discovery (featured cards on empty state)
   - selected Skill chip above the composer
   - Skill-only send interception
   - composer model selector + Skills button
   - legacy Composio connect-link card renderer (old transcripts only; new connects go through the `request_connection` tool → a composer connect card — see `integrations.md`)
   - file-tool result renderer
   - `renderUserMessage` — decodes skill + attachment markers into cards
6. Both **BoardTab** (per-agent kanban) and **Dashboard** (Mission Control / cross-agent kanban) consume this hook so the right panel is identical in both views.

## Org skill by default (HOU-1192)

Since HOU-1027 a workspace also has an **org/workspace skill store** (`ws/<org>/shared/skills/`
cloud, `<Workspace>/.shared/skills/` desktop; ADR 0003): a shared skill lives ONCE,
agents load it via their per-agent manifest (`.houston/skills-manifest/`), and agent
edits hit the one org copy. HOU-1192 makes that the DEFAULT for skills **created with
an agent** (the create-with-AI chat): the moment the heal stamps the chat↔skill link
from the skill's own forward `setup_activity_id` — the one signal with agent-written
provenance; rule 1 only matches an unstamped chat, so it fires exactly once per
creation — the client promotes the SKILL.md verbatim into the store, enables it
ONLY in the creator's manifest (one explicit write, per ADR 0003; this module's
manifest writers are serialized per agent), and deletes the creator's local copy
only when it is still byte-identical, checked directly before the delete (a
mid-flight edit survives as that agent's override). Other agents are deliberately
NOT installed to: the skill sits in the workspace store, and the user enables it
per agent from the Skills page / the per-agent "From your workspace" section. Flow + ordering live in
`app/src/lib/org-skill-share.ts` (node-tested); the binding hook is
`app/src/components/tabs/use-org-skill-default.ts`, invoked from
`use-skill-chat-setup.ts` (heal `reason: "forward_link"` ONLY — orphan adoption and
the list-delta fallback claim never share: the catalog stays interactive beside a
draft chat, so a store install could satisfy the delta heuristic). The share runs
even before `/v1/capabilities` resolves (the claim is one-shot); where the store is
absent or declines (409 slug collision, 403 member role, 404 route absent, typed 503
unconfigured — `isOrgSkillShareDeclined`), the skill stays agent-local exactly as
before, silently.
Store/GitHub installs and the per-agent from-scratch dialog remain agent-scoped
("shared, not installed" applies to agent-created skills); the GLOBAL page's
from-scratch dialog already creates in the store. Ad-hoc creations in a normal
mission chat (no setup-chat claim signal) stay agent-local — share via the Skills
page.

## Global Skills page (sidebar "Skills", HOU-792)

Agent-owned skills are stored ON each agent (`<agent>/.agents/skills/`); shared
skills live once in the workspace store (see above). The top-level **Skills**
page (`app/src/components/skills-view/`, viewMode `skills-home`, sidebar entry
between Integrations and AI Models) is a pure client aggregation over the
existing per-agent routes — the host's skill routes already accept ANY agent
the caller owns (`canUseAgent` is workspace ownership), so no backend changed:

- **Your skills** — one row per slug across the workspace's agents
  (`aggregateWorkspaceSkills` in `app/src/lib/workspace-skills.ts`,
  node:test-covered), each with the holder agents' avatar stack. Fetching uses
  one query per agent on the SAME `queryKeys.skills(path)` keys the per-agent
  tab uses (`use-workspace-skills.ts`), so `SkillsChanged` invalidation
  refreshes the page for free; fetched once per mount, never on focus (hosted:
  a sweep wakes every pod — the `useAllConversations` discipline).
- **Row click → manage dialog** (`manage-skill-dialog.tsx`): edit the full
  SKILL.md (canonical copy = FIRST holder's) + toggle which agents hold it.
  `planSkillAssignment` diffs the edit into the minimal fan-out: newly
  assigned agents always get the canonical content (full-file
  `tauriAgent.writeFile`, the Houston-library copy primitive); existing
  holders are rewritten only when the content itself was edited; unassignments
  confirm first (destructive), and Delete removes it from every holder.
- **Store tab** — the same `SkillMarketplaceSection`; search/preview ride the
  first agent (read-only marketplace proxies), install opens the
  pick-agents dialog (`install-skill-dialog.tsx`; agents already holding the
  slug lock out) and fans out `installCommunity` per picked agent.
- **Custom skills tab** (`global-custom-tab.tsx`) — Create skill (the guided
  chat), Add skill (the multi-agent from-scratch dialog,
  `new-skill-dialog.tsx`), and the Houston library shelves
  (`useHoustonSkillLibraryData`, the agent-agnostic half of the library hook);
  library installs route through the same pick-agents flow
  (`use-global-install-flow.tsx` unifies marketplace + library pending
  installs behind one dialog).
- **New skill / Create skill** — the guided create chat (HOU-791) in the
  SHELL'S right-hand panel: `use-global-chat-flow.tsx` picks the hosting
  agent (`choose-chat-agent-dialog.tsx`; skipped with one agent) and mounts
  `global-skill-chat.tsx`, which drives the per-agent setup-chat machinery
  and starts a fresh draft. The skill is created on that agent first, then
  assignable from the manage dialog.

**Setup chats are side-by-side everywhere (the Routines split).**
`skill-setup-chat.tsx` portals into the shell detail panel
(`useShellDetailPanel`) and owns the panel-open flag on mount/unmount, so on
BOTH the per-agent Skills tab and the global page the catalog stays visible
on the left while the conversation runs on the right (Escape closes, same as
routines). The old swap-the-catalog-for-the-chat behavior is gone.

**The manage dialog is the skill's one detail surface on BOTH pages.** A row
click on the per-agent Skills tab opens the SAME manage dialog the global
page uses (`agent-skill-manage-dialog.tsx` wraps it: lazy cross-agent
aggregation while open, current agent pinned first so its copy is canonical);
the guided chat sits behind the dialog's **Edit in chat** button
(`onEditInChat`), which opens the side-panel chat on the skill's holder. The
raw `SkillEditModal` remains only as the read-only fallback.

**Per-agent Custom tab also shows "From your other agents"**
(`other-agent-skills.tsx`): the user's own skills living on OTHER agents,
one-click copyable onto this agent (load the holder's SKILL.md verbatim →
`writeFile` here — the Houston-library copy primitive). Mounted only inside
the tab content so the cross-agent fan-out runs only when the tab opens.

The sidebar nav item made the bare "Skills" text ambiguous in e2e — scope
selectors (see `skills-add-dialog.spec.ts`).

## Add Skills UI — the catalog-grammar Skills surface

The agent's Skills section (`app/src/components/tabs/skills-content.tsx`) is
the shared **catalog layout** (the ui/core `CatalogShell`, same two-section grammar
as the Integrations surfaces and the AI hub, no page header — the nav label carries
it): ONE top `CatalogSearchField` (`grid.searchSkills`) — the page's single query,
owned by `skills-content.tsx` — with an always-available clear X when text is
present, and a successful install clearing the query — over the consolidated
**Your skills** section
(`grid.yourSkillsHeading`, an `lg` `CatalogSectionHeader` + count chip; installed-skill
ROWS, not tiles) and the **Available** section (`grid.availableHeading`) holding two
discovery tabs — **Store** (`skills:tabs.store`, the skills.sh marketplace) and
**Custom skills** (`skills:tabs.custom`, currently a pure EMPTY STATE:
`tabs.customEmptyTitle` + `tabs.customEmptyDescription` + the filled **Add skill** CTA
that opens the GitHub / From-scratch `AddSkillDialog`; its real behavior is TBD).
The one page query filters the strip AND the store: `useInstalledSkillsStrip(skills,
onEditSkill, query)` narrows the rows via `filterInstalledSkills` (a case-insensitive
substring over display title + slug) and OMITS the whole Your-skills section when it
matches none; `skill-discovery-tabs.tsx` forwards the same `query`/`onQueryChange`
down into `SkillMarketplaceSection`, which is now CONTROLLED (`query`/`onQueryChange`
+ `hideSearch` — its own "Discover skills" heading and search box are suppressed under
the shared Available header, its publisher filter chips kept). The old per-strip
`grid.searchYourSkills` / `grid.noMatchingSkills` keys are GONE. Read-only mode
(managed agent, non-manager) yields ZERO tabs — the shell then renders only the strip.
The Skills.sh store is `SkillMarketplaceSection` (`ui/skills/`), mounted as the Store
tab's content when the marketplace handlers are wired; it fetches its shelves feed on
mount.

The section composes `SkillMarketplaceGrid` + `SkillMarketplaceRow` +
`SkillPreviewModal` (all in `ui/skills/`). `SkillMarketplaceRow` is the shared
catalog grammar (`CatalogRow` from ui/core): owner avatar, `kebabToTitle` name,
`by <owner> · <installs>` subtitle, transparent at rest with the full-row hover
fill. The row BODY opens `SkillPreviewModal` (a `Dialog` overlay); the ghost
round `+` (`CatalogAddButton`, spinning while THIS skill installs) is the
install action, becoming a quiet check mark once installed — the old labeled
Add pill and the separate info button are gone. Publisher-derived filter chips
(skills.sh has no real categories, so `topPublishers` derives them from the
`owner/repo` source) render in search mode only.

**What the preview modal shows** (top to bottom): owner avatar + title +
`by owner · repo` + install count; the parsed SKILL.md description (skeletons
while loading, the load-error note otherwise); the **connected apps** the skill
declares; its authored **category** (an outlined chip, visually distinct from
the soft filled tag pills) and **tags**; the **full SKILL.md body** behind a
collapsed-by-default "View full instructions" expander (raw markdown in a
height-capped, scrollable monospace block — the same read-only treatment as
`SkillEditModal`, no markdown renderer); then the install button. Every section
below the description renders only when the loaded preview carries it, so a bare
skill looks exactly as it did before, and the loading/error/empty states are
untouched. The dialog is capped at `max-h-[85vh]` so an expanded body can never
push it past the window. Connected apps arrive through the optional
`renderIntegrations?: (slugs: string[]) => ReactNode` prop
(`SkillMarketplaceSection` → `SkillMarketplaceDetail` → `SkillPreviewModal`):
`ui/skills` never resolves a Composio slug, so `skill-discovery-tabs.tsx` passes
`<IntegrationBadges toolkits={skillIntegrationSlugs(slugs)} label={t("detail.integrations")} />`,
the same "Works with" row the edit modal carries. The modal's own files:
`skill-preview-modal.tsx` (composition), `skill-preview-modal-labels.ts` (the
labels type + English defaults, reused as the section's `preview` defaults),
`skill-preview-sections.tsx` (taxonomy + instructions blocks), and the pure
`skill-preview-sections-model.ts` (`skillPreviewSections` trims/dedupes the
hand-authored frontmatter and decides which sections exist — node:test-covered).

### Installed skills — strip rows with an edit modal (no separate detail screen)

The per-agent Skills section (`app/src/components/tabs/agent-admin/agent-admin-skills.tsx`
→ `SkillsContent`) renders the installed list through the shared responsive
`SkillCatalogGrid` / `SkillCatalogRow` pair in
`app/src/components/skills/skill-catalog-rows.tsx`; the consolidated strip
(`app/src/components/tabs/installed-skills-strip.tsx`, the
`useInstalledSkillsStrip` hook) owns sorting, filtering, and preview expansion.
The row grammar matches the Store/browse list: the skill's own `SkillIcon` (image resolved via `resolveSkillImageUrl` in
`app/src/lib/skill-image.ts`, or a `skillMonogram` letter box when it has none),
the always-visible display title, a one-line description, and a quiet trailing
`ChevronRight` marking each row as an open-affordance (the shared convention with
the installed integrations + connected providers strips). A row click opens the
edit modal — the skill's ONE detail surface. At rest the grid caps to the shared
`CATALOG_INSTALLED_PREVIEW_CAP` (6) rows behind a `CatalogShowMore` "Show all N"
expander (`grid.showAllSkills`) so a well-stocked strip never buries the discovery
tabs; an active search drops the cap and shows every match uncapped. That
preview / expander split and the `filterInstalledSkills` search filter are the
shared node-safe `app/src/lib/installed-preview.ts` (the generic
`installedPreview<T>` helper the integrations + providers strips also use, cap
injected).
The old
`installed-skill-tile.tsx` icon-tile composition and the earlier
`InstalledSkillRow` (pen/trash row) were both DELETED with this convergence. To
hold the 200-line file law `SkillsContent`
stays a thin orchestrator delegating to three siblings in `tabs/`:
`installed-skills-strip.tsx` (the `useInstalledSkillsStrip` hook: sort + search
+ the strip node), `skills/skill-catalog-rows.tsx` (the shared installed-skill
row grammar), `skill-discovery-tabs.tsx` (`useSkillDiscoveryTabs`: the
Store + Custom tab array), and `skill-editor-dialogs.tsx` (`SkillEditorDialogs`:
the edit modal + delete-confirm handshake).

Editing happens in `SkillEditModal` (`ui/skills/src/skill-edit-modal.tsx`), a
`Dialog`/`DialogContent` overlay mirroring `SkillPreviewModal` (`sm:max-w-2xl`,
`bg-dialog` surface): title = the skill's display name with a muted one-line
description under it (`DialogTitle`/`DialogDescription` for a11y), body = the editor
content states (loading skeleton lines / inline load-error note / a roomy fixed-height
`h-80 resize-none overflow-y-auto` monospace textarea seeded from the loaded
markdown), footer (`DialogFooter`) = an optional destructive **Delete** pill
pinned left (`mr-auto`; rendered only when `onDelete` is wired — the tile has no
per-tile delete affordance, so the destructive action lives here and opens the
existing `ConfirmDialog` with `detail.deleteTitle`/`deleteDescription` copy) +
Cancel (ghost) + Save changes (primary pill, disabled until dirty, "Saving..."
state). A successful save clears the editing
skill in `useSkillSurface`, which closes the modal; a save rejection propagates to
the app toast path. The modal is rendered once by `SkillsContent` (one at a time),
not by the row. The content loads via the existing `useSkillDetail` →
`tauriSkills.load` path (the 404 for a missing skill stays silenced via
`isMissingSkillError` — see below); its state machine is the pure
`deriveInstalledSkillEditorState` (`installed-skill-editor-model.ts`,
node:test-covered). App state (which skill is being edited, editor state,
save/delete) lives in `useSkillSurface` (`editingSkillName` + `editorState`); labels
(`installedRowLabels` for the row, `editModalLabels` for the modal) come from
`useSkillSurfaceLabels`. The old navigate-to-a-separate-screen flow and the
`SkillDetailPage` / `SkillDetailHeaderActions` components were **deleted**; the
previous inline-editor panel (`installed-skill-editor.tsx`, `col-span-full` expansion)
was **replaced** by the modal.
The modal fetches the skill's real SKILL.md on demand via the
`POST .../skills/community/preview` route (`packages/host/src/skills/preview.ts`,
read-only, no vfs) before the user commits to install; install stays enabled
even if that fetch fails. `CommunitySkillPreview` (`packages/protocol/src/domain/skill.ts`,
mirrored in `ui/engine-client/src/types.ts` + `ui/skills/src/types.ts`) carries
`title/description/image/category/tags` PLUS `integrations` (the frontmatter
`integrations:` toolkit slugs, so the modal can show which apps the skill
connects) and `content` (the SKILL.md body with frontmatter stripped — the
`body` half of `parseSkillMd`, never re-stripped client-side; `null` only when
the frontmatter failed to parse and the preview degraded to the empty shape).
The shared
`locateSkillMd` (`github-lookup.ts`) resolves the SKILL.md in three cost-ordered
tiers — cheap raw-CDN path guesses, then a shallow tree scan (≤2 small
non-recursive `api.github.com` calls that fuzzy-match `skills/*` dir names and
confirm via frontmatter `name:`, so e.g. `skills/use-ai-sdk/` declaring
`name: ai-sdk` resolves), then the expensive whole-repo recursive scan (install
only; preview passes `deepScan: false`). Preview results are cached host-side by
`PreviewDirectory`: successes fresh 24h, failures negatively cached 10min, so
repeated row clicks don't refetch. The search/popular/install
state machine lives in `use-skill-marketplace-state.ts` (pure phase transitions
in `skill-marketplace-state-model.ts`); the grid is purely presentational. App
wiring: `useSkillSurface.handlePreview` → `tauriSkills.previewCommunity` →
`engine.previewCommunitySkill`. Install failures surface as a visible toast from
`handleInstallCommunity` (the row only re-enables its button, so the toast
carries the reason per the no-silent-failures rule). The default view (search box
blank, "All categories" selected) is NOT a flat popular list but six curated,
founder-relevant category shelves (`skill-marketplace-shelves.tsx` +
`use-skill-marketplace-shelves.ts`, pure model + `DEFAULT_SHELVES` in
`skill-marketplace-shelves-model.ts`): Marketing / Sales / Writing / Research /
Legal / Productivity, each a validated skills.sh query fired concurrently when the
section mounts (the host serializes + caches them) and rendered progressively
(skeleton while loading, hidden on error, retryable `browseUnavailable` fallback
only if every shelf fails). There is **no Popular shelf** — its skills.sh seed was
dev-skewed, so the whole popular pathway (the `onPopular` prop, app `handlePopular`,
`tauriSkills.popularCommunity`, and the adapter/engine-client
`popularCommunitySkills` methods) was removed client-side; the host's public
`community/popular` route stays. No author repeats ANYWHERE
in the preview: each shelf stores one skill per author (`dedupeByOwner` in
`skill-marketplace-shelves-model.ts`, first hit per `owner`, capped at
`SHELF_CARD_CAP` = 8 candidates), and the component then runs the pure
`dedupeAcrossShelves` at render time in shelf display order — an owner rendered
by an earlier shelf is skipped by every later one (skills.sh categories overlap
heavily, so the same prolific publishers headlined every shelf). Only RENDERED
owners consume (an uncapped spare never blocks a later shelf); a shelf emptied
by the pass hides (`isShelfVisible` now requires a non-empty ready list).
Search/category results stay complete so nothing is undiscoverable. Each shelf
renders a capped 2-column mini-grid of rows (`SHELF_GRID_CAP` = 4, matching the
Integrations aesthetic); its "See all"
now SELECTS that category in the dropdown (one mental model), not a search-box
stuff. A **category dropdown** (`skill-category-select.tsx`, a `@houston-ai/core`
Popover + Command pill mirroring the app's `FilterCombobox` look) sits beside the
search box in the same control row (search `flex-1` + dropdown trailing, the
Integrations `AppCatalogGrid` layout). "All categories" + empty box → the shelves
browse; picking a category fires `onSearch(shelf.query)` uncapped through the same
search machinery (its own state in `SkillMarketplaceSection`, never written into
the search box) → the flat result grid + publisher chips; typing a query beats the
category, clearing returns to it. Publisher chips render only in that
search/category result mode. The grid takes the browse view as one optional
`shelvesSlot` node (the section passes it only while "All" is selected), keeping
its search contract unchanged.

The i18n copy for the section lives under the **top-level `store.*`** key group
in `app/src/locales/{en,es,pt}/skills.json` (promoted out of `addDialog.store`
when the store left the dialog); `useSkillMarketplaceSectionLabels`
(`app/src/components/tabs/use-skill-surface-labels.ts`) maps it to the section's
`labels` prop, and `useSkillDialogLabels` in the same file now carries only the
GitHub/From-scratch dialog copy.

## Community search behavior

`POST /v1/skills/community/search` calls `skills.sh`, which can rate-limit.
The engine owns the resilience: successful searches are cached in-memory,
outbound requests are globally spaced, and stale cached results are returned
during a temporary 429/network failure. App search callers handle remaining
failures inline in the Add Skills UI; they should not show global "Houston
problem" bug toasts for marketplace search misses.

Both engines implement the same routes and resilience. TS host (current):
the read-only marketplace surface (search/popular/repo-list — no workspace
touched) is served agent-scoped at `POST /agents/:id/skills/...` — the path
every shipped client uses, because the hosted gateway proxies ONLY
`/agents/:slug/*` (a top-level read 404'd there and broke the whole Add
Skills dialog against the cloud) — AND top-level at `POST /v1/skills/...`
(`packages/host/src/routes/skills-directory.ts`, kept for direct host API
callers). The web/desktop adapter (`packages/web/src/engine-adapter/`)
threads the browsing agent's id through search/popular/repo-list for that
reason; installs are agent-scoped only.
`packages/host/src/routes/skills-remote.ts` dispatches
`POST skills/community/{search,popular,install}` and
`POST skills/repo/{list,install}` to `packages/host/src/skills/`
(`community.ts` = skills.sh cache/spacing/stale-fallback, `github.ts` +
`github-parse.ts` = repo discovery, `install.ts` = install composition on the
workspace Vfs). Typed failures answer `{error: {code, message, details:
{kind}}}` so `HoustonEngineError.kind` carries the same
`ui/skills/src/skill-error-kinds.ts` taxonomy the Rust engine emits. Legacy
Rust oracle: `engine/houston-skills/src/remote.rs`.

## Installing a community / repo skill

`install_skill` (skills.sh) and `install_from_repo` (GitHub) both route the
fetched `SKILL.md` through `houston_skills::install_skill_md` (Rust) /
`composeInstalledSkillMd` in `packages/domain/src/skill-install.ts` (TS host),
which **preserves the author's frontmatter** (description, category,
integrations, image) instead of rebuilding a bare one. Two invariants matter:

- The install slug owns the on-disk directory **and** the frontmatter `name`
  (derived from the source `name:` when valid, else a slugified id), so the two
  never drift and `list_skills` always finds the installed skill.
- Installed skills are marked `featured: true`. A user who explicitly installs
  a skill must be able to find it: the chat empty state shows only featured
  skills when any exist, so a non-featured install would silently never appear
  on the cards. Bookkeeping (version/created/last_used) is reset to a fresh
  install.

### Repo input parsing (the "Install from another repo" field)

`normalize_source` in `engine/houston-skills/src/remote.rs` (Rust) and
`normalizeSource` in `packages/host/src/skills/github-parse.ts` (TS host) are
the single front door for whatever the user types into the repo field. It anchors on the
`github.com` host wherever it appears, so it recovers `owner/repo` from the
short form, a full URL (`.git`, `/tree/main`, `?query`, `#frag` all tolerated),
the SSH form (`git@github.com:owner/repo`), and even a whole pasted shell
command (`npx skills add https://github.com/owner/repo --skill x`). The
extracted pair is then validated against GitHub's owner/repo charset before any
network call. Unparseable input (a bare word like `reconciliation`, free text,
a command with no GitHub link) returns the typed `SkillError::InvalidRepoSource`
→ `kind: "invalid_repo_source"` → a "type owner/repo" hint, instead of firing a
doomed GitHub lookup that 404s and echoes the garbage back. This was HOU-440:
users pasted commands and got `Couldn't find a repo named 'npx skills add ...'`.
When you add a `SkillError` variant, mirror its `kind` in
`ui/skills/src/skill-error-kinds.ts` (that union is the TS source of truth).

## Skill invocation marker (chat persistence)

When the user runs a Skill, the persisted user_message body is:

```
<!--houston:skill {"skill":"research-company","displayName":"Research a company","image":"...","description":"...","integrations":["tavily"],"fields":[],"message":"Focus on pricing.","attachments":[]}-->

Use the research-company skill.

Focus on pricing.
```

- The HTML-comment marker is inert text to Claude (it ignores it) but carries everything the chat renderer needs to draw the card. Single source of truth = single persisted body.
- The marker `message` is the user's optional composer text. The body is the Claude-facing prompt and always starts with `Use the <skill> skill.`.
- If files were uploaded with the Skill, `attachments` carries `{name,path}` entries. The renderer shows only the count badge; the Claude-facing body still contains the `[User attached these files...]` path block.
- Decoder lives in `@houston-ai/chat`'s `skill-message.ts` so desktop AND mobile render the same card from the same payload. The decoder also accepts a legacy `<!--houston:action ...-->` prefix so chat history persisted before the rename keeps rendering as a card.
- Encoder (`encodeSkillMessage`) + Claude-prompt assembler (`buildSkillClaudePrompt`) live in `app/src/lib/skill-message.ts` — only the desktop sends Skills today.
- The persisted body is also the activity's `description`, which surfaces as the **mission-card / archived-list subtitle**. Those mapping sites run it through `@houston-ai/chat`'s `messagePreviewText` so the card shows the user's words (or the Skill's one-line description when sent on its own), never the raw `<!--houston:skill ...-->` marker. This was HOU-425: a Skill sent as the first message rendered the marker JSON as the card subtitle.

## Attachment message marker (chat persistence)

Regular messages with uploaded files follow the same "single persisted body"
pattern as Skills:

```
<!--houston:attachments {"message":"Summarize this","files":[{"name":"brief.pdf","path":"/Users/.../brief.pdf"}]}-->

Summarize this

[User attached these files. Read them with the Read tool if needed:
- /Users/.../brief.pdf]
```

- The model receives the same path block as before, so file access behavior does not change.
- The UI decodes the marker and renders the user text plus a compact paperclip badge ("1 file attached" / "N files attached"). Absolute paths are never displayed.
- Decoder + shared badge renderer live in `@houston-ai/chat` (`attachment-message.ts`, `user-attachment-message.tsx`). Desktop encoder lives in `app/src/lib/attachment-message.ts`.

## Authoring a Skill via Claude

When the user asks "create a skill that does X", Claude should:
1. Pick a slug (kebab-case, descriptive).
2. Write `~/.houston/workspaces/<Workspace>/<Agent>/.agents/skills/<slug>/SKILL.md` with the full frontmatter schema above.
3. Set `description` carefully — it's the trigger phrase Claude itself will use for tool matching later.
4. Default to `featured: yes` for new Skills until proven otherwise (so the user actually finds them).
5. Include an `image` slug — pick a relevant Fluent emoji (browse the assets folder).
6. Body: at least an `## Instructions` or `## Procedure` section.

### Naming rules — non-technical users only

The user never sees the `name` slug — they see `humanize(name)` (e.g. `"Research company"` from `"research-company"`). Houston's audience is non-technical founders who have never opened a terminal. Pick slugs that **humanize cleanly into a phrase a founder would say in chat**.

- ✅ `review-a-contract` → "Review a contract"
- ✅ `is-this-name-free` → "Is this name free"
- ✅ `prepare-the-delaware-annual-filing` → "Prepare the Delaware annual filing"
- ❌ `respond-to-a-dsr-without-missing-the-clock` ("DSR" is jargon)
- ❌ `pre-fill-an-enterprise-security-questionnaire` (verb is unnatural; humanizes oddly)
- ❌ `assemble-a-first-hire-offer-packet` ("packet" is internal jargon)

**Rules:**

1. **No insider acronyms** in the slug. NDA is fine (universally known); MSA, DSR, CIIAA, ASC, ARR, GAAP, KPI are not. If the underlying concept needs an industry term, put it in the `description` (where it's still searchable) or in the body, not the slug.
2. **2 to 6 words** when humanized. Long phrases hurt readability in cards.
3. **Verb-led, founder-voice** ("Draft an NDA", "Check my deadlines"), not internal taxonomy ("Document drafter", "Deadline tracker").
4. **No `display_name` override.** The schema does not have one. The slug *is* the name. If a slug doesn't humanize cleanly, rename it; don't paper over it.
5. **`description`** carries the user-facing one-liner shown on the card. Lead with what the user gets, then any constraint ("Drafts only, you sign"). Avoid file paths, JSON keys, tool names (Composio, Firecrawl), config field names, scope enums.
6. **Body** is for the AI. Procedural detail (file paths, schemas, JSON shapes) is fine and necessary — it's what makes the procedure work. But anywhere the body tells the AI what to *say to the user* ("Summarize to user…", "respond:", clarifying questions), the wording must be plain English: never name files, paths, configs, or other skills' slugs.

Cross-references between skills live inside bodies, never in user-facing wording. When you rename a primitive slug, update every cross-reference.

### When you rename or remove a packaged Skill

A renamed Skill that ships in a Store-bundled package needs a migration step in the package's `.migrations.json`, otherwise existing users end up with the old slug AND the new slug both present in their picker (the sync logic only adds, never deletes).

Format:

```json
[
  {
    "from": "<previous-version>",
    "to": "<this-version>",
    "renames": {
      "<old-slug>": "<new-slug>"
    }
  }
]
```

The engine applies the rename per workspace on the next sync. If only the old slug exists, it's renamed in place — body content preserved, `name:` field fixed, rest of the frontmatter refreshed from the new package. If both old and new slugs already exist (because a prior sync without migrations copied the new one alongside the old), the **old one is deleted**: the bundled package no longer ships it, every cross-reference points to the new slug, so keeping it would just leave a duplicate in the picker. See `store/README.md` for the full mechanism, including the recipe for shipping a follow-up migration step when the rename was published before the migration mechanism existed.

## Skill identity = directory slug (drift-resilient)

> Current-direction (TS engine) behavior. The Rust paths below are the legacy oracle.

The **directory slug is the one canonical identity** for a skill. `loadSkillDetail`, the create/save/delete routes, and the host's `GET /v1/skills/<slug>` all resolve by the on-disk directory (`packages/domain/src/skills.ts` `skillKey`), never by the frontmatter. So the name a caller hands `load_skill` MUST be a directory slug.

Therefore `loadSkills` (via `parseSkillMd`) reports each skill's **directory slug** as `name`, overriding whatever the frontmatter `name:` says. Agent-authored SKILL.md files sometimes carry a display phrase in `name:` (e.g. dir `redactar-outreach-esg`, frontmatter `name: Redactar Outreach ESG`). Before HOU-515/HOU-441 the list handed the UI the phrase, the user clicked it, and `loadSkill("Redactar Outreach ESG")` 404'd → a hard "skill not found" (red bug toast + Sentry). Reporting the directory slug makes the list → click → load round-trip consistent. The Skills card still shows a friendly title via `humanizeSkillName(slug)`, so the kebab slug is never shown raw. No frontmatter healing is needed: pi loads skills through `DefaultResourceLoader` (`packages/runtime/src/session/resource-loader.ts`), so there is no `.claude` mirror or native tool name to keep in step (the legacy Rust engine healed `name:` on open for exactly that reason).

Genuinely missing skills still happen (deleted, never installed, a stale selection). The host answers `404 { error: "skill not found" }`, surfaced by `@houston-ai/engine-client` as a `HoustonEngineError` with `status: 404` (the TS host emits bare-string bodies, so there is **no** typed `.kind` here — unlike the Rust engine). That 404 is an expected, explainable state, **not** a Houston bug: `tauriSkills.load` passes `{ silence: isMissingSkillError }` (`app/src/lib/missing-skill.ts`) so the error skips the red bug toast + Sentry report, and `useSkillSurface` surfaces it inline (a friendly info toast, collapses the open row, refetches the list so the dead row vanishes).

### Legacy Rust engine (oracle)

The Rust engine applied the same directory-slug identity rule through different paths. `load_skill`, `save`, `delete`, and the `.claude/skills/<slug>` mirror all resolve by `skills_dir.join(<name>)` — the directory, never the frontmatter. `list_skills` (and the system-prompt `index::build`) report each skill's **directory name** as `name`, overriding the frontmatter `name:`. Before HOU-441 the list handed the UI the phrase, the user clicked it, and `load_skill("Redactar Outreach ESG")` found no such directory → a hard `skill_not_found` (red bug toast + Sentry). Reporting the directory slug makes the list → click → load round-trip consistent and gives the `.claude` mirror a real target. `load_skill` also **heals** the frontmatter `name:` to the slug on open (it already rewrites the file for `last_used`), so Claude Code's native tool name stops drifting too. No bulk migration — identity is fixed at read time and self-heals on access. In the Rust engine a genuinely missing skill surfaces as a typed `skill_not_found`, silenced via `tauriSkills.load`'s `silenceKinds: ["skill_not_found"]`.

## Files of interest

| What | Where |
|------|-------|
| Skills domain (TS, current) | [`packages/domain/src/skills.ts`](../packages/domain/src/skills.ts) — parse + `loadSkills`/`loadSkillDetail`, identity = directory slug |
| Skills host routes (TS, current) | [`packages/host/src/routes/skills.ts`](../packages/host/src/routes/skills.ts) — GET/POST/PUT/DELETE; missing skill → 404 |
| Marketplace host routes (TS, current) | [`packages/host/src/routes/skills-remote.ts`](../packages/host/src/routes/skills-remote.ts) — skills.sh search/popular/install + GitHub repo list/install |
| Marketplace remote logic (TS, current) | [`packages/host/src/skills/`](../packages/host/src/skills/) — community cache, GitHub discovery, install composition |
| Install composition (TS, current) | [`packages/domain/src/skill-install.ts`](../packages/domain/src/skill-install.ts) — `composeInstalledSkillMd`, frontmatter-preserving |
| Missing-skill classifier (TS, current) | [`app/src/lib/missing-skill.ts`](../app/src/lib/missing-skill.ts) — `isMissingSkillError` (404) keeps it off the bug-toast/Sentry path |
| Skills surface hook (TS, current) | [`app/src/components/tabs/use-skill-surface.ts`](../app/src/components/tabs/use-skill-surface.ts) — inline "Skill unavailable" handling |
| Schema (Rust) | [`engine/houston-skills/src/lib.rs`](../engine/houston-skills/src/lib.rs) |
| Parser / serializer | [`engine/houston-skills/src/format.rs`](../engine/houston-skills/src/format.rs) |
| Engine DTO | [`engine/houston-engine-core/src/skills.rs`](../engine/houston-engine-core/src/skills.rs) |
| TS wire types | [`ui/engine-client/src/types.ts`](../ui/engine-client/src/types.ts) |
| App shared hook | [`app/src/components/use-agent-chat-panel.tsx`](../app/src/components/use-agent-chat-panel.tsx) |
| Selected Skill chip | [`app/src/components/selected-skill-chip.tsx`](../app/src/components/selected-skill-chip.tsx) |
| Card on user message | [`app/src/components/user-skill-message.tsx`](../app/src/components/user-skill-message.tsx) (the mobile PWA copy was removed with `mobile/`) |
| Marker codec | [`ui/chat/src/skill-message.ts`](../ui/chat/src/skill-message.ts) (decode) and [`app/src/lib/skill-message.ts`](../app/src/lib/skill-message.ts) (encode) |
| Card/list preview text | [`ui/chat/src/message-preview.ts`](../ui/chat/src/message-preview.ts) — `messagePreviewText` decodes a marker → mission-card subtitle (HOU-508) |
| System prompt template | [`app/src-tauri/src/houston_prompt/skills_memory.rs`](../app/src-tauri/src/houston_prompt/skills_memory.rs) (`SELF_IMPROVEMENT_GUIDANCE`) |
