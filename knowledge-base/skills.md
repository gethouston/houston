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
category: research                 # tab in picker; missing = "Other"
featured: yes                      # showcase on chat empty-state cards
image: magnifying-glass-tilted-left
                                   # Fluent 3D emoji slug OR full https URL
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
| `category` | string | unset | Picker tab grouping. Missing → falls under "Other". |
| `featured` | bool | `false` | Accepts `yes` / `true` / `1` / `on`. Surfaces on the empty-chat showcase. |
| `image` | string | unset | Either an `https://...` URL OR a Fluent 3D Emoji slug (lowercased folder name from [microsoft/fluentui-emoji/assets](https://github.com/microsoft/fluentui-emoji/tree/main/assets), spaces → dashes). Resolved frontend-side via `resolveSkillImage`. |
| `integrations` | string[] | `[]` | Composio toolkit slugs. Drives the small logo row on the card. |

## Render pipeline

1. **Engine** parses SKILL.md frontmatter via `serde_yml` (`engine/houston-skills/src/format.rs`). Unknown fields are silently ignored — old skills with `icon:` / `starter_prompt:` still parse.
2. Engine returns the full `SkillSummaryResponse` on `GET /v1/skills`.
3. **App** (`useSkills` query → `tauri.ts` → `engine-client`) maps the snake/camel-case wire shape back to app's `SkillSummary`.
4. **Skill cards** use `app/src/components/skill-card.tsx` across the chat empty state and the New Mission picker. Keep these in sync by reusing the component, not recreating card markup. (The per-agent Skills tab no longer uses `SkillCard`: its installed list now renders `InstalledSkillRow`s — see "Add Skills UI" below.) **First-party store skills ship fully translated** (en/es/pt SKILL.md trees; a Spanish workspace seeds Spanish skills, the agent runs the Spanish procedure, editing is in Spanish). Display names come from the frontmatter `title:` field via `skillDisplayTitle` (accents the ASCII slug can't carry), falling back to `humanize(slug)`. See `knowledge-base/i18n.md` § "Store skills are translated at the CONTENT level".
5. **`useAgentChatPanel`** (`app/src/components/use-agent-chat-panel.tsx`) — single source of truth for the per-agent panel UX. Owns:
   - skill discovery (featured cards on empty state)
   - selected Skill chip above the composer
   - Skill-only send interception
   - composer model selector + Skills button
   - legacy Composio connect-link card renderer (old transcripts only; new connects go through the `request_connection` tool → a composer connect card — see `integrations.md`)
   - file-tool result renderer
   - `renderUserMessage` — decodes skill + attachment markers into cards
6. Both **BoardTab** (per-agent kanban) and **Dashboard** (Mission Control / cross-agent kanban) consume this hook so the right panel is identical in both views.

## Add Skills UI — inline marketplace section (Integrations-style)

The Skills.sh marketplace ("the store") lives **inline on the agent's Skills
tab**, below the installed-skills list, styled like the Integrations tab
(installed at top, browse catalog below on the same page) — NOT inside a dialog.
The `AddSkillDialog` is now **GitHub / From scratch only** (the store tab was
removed). The store is `SkillMarketplaceSection` (`ui/skills/`), mounted by
`app/src/components/tabs/skills-content.tsx` when the marketplace handlers are
wired and the surface is not read-only; it fetches its shelves/popular feed on
mount (prop `active`, default true), not lazily on dialog-open. Its section
header ("Discover skills" / "Add ready-made skills from the community.") sits
above the search box; the installed list gets its own "Your skills" heading.

The section composes `SkillMarketplaceGrid` + `SkillMarketplaceRow` +
`SkillPreviewModal` (all in `ui/skills/`): compact **rows** in the Integrations
`AppRow` idiom (owner avatar left, `kebabToTitle` name + `by <owner> · <installs>`
subtitle, and TWO always-visible trailing actions in `[Add pill] [info icon]`
order — a labeled **Add** pill (Integrations connect-pill idiom: `bg-primary`,
`Adding...` spinner, muted `Added` check once installed) followed by an **info**
button), laid out as a two-column `gap-2` grid; publisher-derived filter chips
(skills.sh has no real categories, so `topPublishers` derives them from the
`owner/repo` source, search mode only). The "Powered by Vercel" attribution badge
(skills.sh runs on Vercel) sits **inline on the subheading line** in the section
header: heading on its own line, then one `flex flex-wrap items-center gap-x-2`
line holding the subheading text followed by the `PoweredByVercelBadge` (both
muted small text, wraps gracefully at narrow widths) — not stacked, and not at
the bottom of the grid. Row click (or the
info button) opens `SkillPreviewModal` — a `Dialog` overlay (replacing the old
body-swap `SkillPreviewSheet`, which only existed because the store lived in a
fixed-size dialog); the Add pill `stopPropagation`s so it never also opens the modal.

### Installed skills — rows with an edit modal (no separate detail screen)

The per-agent Skills tab (`app/src/components/tabs/agent-admin/agent-admin-skills.tsx`)
renders the installed list as `InstalledSkillRow`s (`ui/skills/`) in the SAME
two-column `grid grid-cols-1 gap-2 sm:grid-cols-2` as the marketplace, not as
`SkillCard`s. Each row is the AppRow idiom: a `size-8 rounded-lg` image box
(monogram fallback on the display title's first letter; the app passes a resolved
URL via `resolveSkillImageUrl` in `app/src/lib/skill-image.ts`, shared with
`SkillIcon`), the display title + one-line description, and TWO icon-only trailing
actions in `[pen] [trash]` order — a **pen** (left) that opens the edit modal and a
**trash** (right) that opens the delete confirm. Both are `size-7 rounded-lg
text-muted-foreground hover:bg-foreground/[0.05]`; the pen hovers to
`hover:text-foreground`, the trash to the destructive `hover:text-destructive`; both
`stopPropagation`. A row-body click also opens the edit modal (mirroring the
marketplace rows' row-click-opens-modal pattern). Delete opens the existing
`ConfirmDialog` (reusing `detail.deleteTitle`/`deleteDescription` copy). Row aria
labels come from `grid.editSkillAria` / `grid.deleteSkillAria`.

Editing happens in `SkillEditModal` (`ui/skills/src/skill-edit-modal.tsx`), a
`Dialog`/`DialogContent` overlay mirroring `SkillPreviewModal` (`sm:max-w-2xl`,
`bg-dialog` surface): title = the skill's display name with a muted one-line
description under it (`DialogTitle`/`DialogDescription` for a11y), body = the editor
content states (loading skeleton lines / inline load-error note / a roomy fixed-height
`h-80 resize-none overflow-y-auto` monospace textarea seeded from the loaded
markdown), footer (`DialogFooter`) = Cancel (ghost) + Save changes (primary pill,
disabled until dirty, "Saving..." state). A successful save clears the editing
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
The modal fetches the skill's real SKILL.md description on demand via the
`POST .../skills/community/preview` route (`packages/host/src/skills/preview.ts`,
read-only, no vfs) before the user commits to install; install stays enabled
even if that fetch fails. The shared
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
`community/popular` route stays. Each shelf renders a capped 2-column mini-grid of
rows (`SHELF_GRID_CAP` = 4, matching the Integrations aesthetic); its "See all"
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
5. Include an `image` slug — pick a relevant Fluent 3D emoji (browse the assets folder).
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
