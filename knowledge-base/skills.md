# Skills

A Skill is a reusable procedure stored as a markdown file with YAML frontmatter. Houston shows them in the picker, the chat empty state, and the per-agent Skills tab.

## File layout

```
.agents/skills/<slug>/SKILL.md       # source of truth, YAML frontmatter + body
.claude/skills/<slug>                # symlink → ../../.agents/skills/<slug>
                                     # auto-created by engine on `list_skills`
```

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
4. **Skill cards** use `app/src/components/skill-card.tsx` across the chat empty state, picker, and Skills tab. Keep these in sync by reusing the component, not recreating card markup.
5. **`useAgentChatPanel`** (`app/src/components/use-agent-chat-panel.tsx`) — single source of truth for the per-agent panel UX. Owns:
   - skill discovery (featured cards on empty state)
   - selected Skill chip above the composer
   - Skill-only send interception
   - composer model selector + Skills button
   - Composio link card renderer
   - file-tool result renderer
   - `renderUserMessage` — decodes skill + attachment markers into cards
6. Both **BoardTab** (per-agent kanban) and **Dashboard** (Mission Control / cross-agent kanban) consume this hook so the right panel is identical in both views.

## Community search behavior

`POST /v1/skills/community/search` calls `skills.sh`, which can rate-limit.
Engine owns the resilience: successful searches are cached in-memory, outbound
requests are globally spaced, and stale cached results are returned during a
temporary 429/network failure. App search callers handle remaining failures
inline in the Add Skills UI; they should not show global "Houston problem" bug
toasts for marketplace search misses.

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

Genuinely missing skills still happen (deleted, never installed, a stale selection). The host answers `404 { error: "skill not found" }`, surfaced by `@houston-ai/engine-client` as a `HoustonEngineError` with `status: 404` (the TS host emits bare-string bodies, so there is **no** typed `.kind` here — unlike the Rust engine). That 404 is an expected, explainable state, **not** a Houston bug: `tauriSkills.load` passes `{ silence: isMissingSkillError }` (`app/src/lib/missing-skill.ts`) so the error skips the red bug toast + Sentry report, and `useSkillSurface` surfaces it inline (a friendly info toast, clears the selection, refetches the list so the dead card vanishes).

## Files of interest

| What | Where |
|------|-------|
| Skills domain (TS, current) | [`packages/domain/src/skills.ts`](../packages/domain/src/skills.ts) — parse + `loadSkills`/`loadSkillDetail`, identity = directory slug |
| Skills host routes (TS, current) | [`packages/host/src/routes/skills.ts`](../packages/host/src/routes/skills.ts) — GET/POST/PUT/DELETE; missing skill → 404 |
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
