# Files-First (`.houston/`)

Houston uses files, not DB, for agent-visible data. SQLite only for chat replay + app prefs.

> **Updated: the backend is the TypeScript host now, not the Rust engine.** The
> `.houston/` layout, atomic-write discipline, JSON schemas, and AI-native
> reactivity model below all carry over unchanged — but the implementation moved
> from the deleted Rust crates (`houston-agent-files`, `houston-engine-core`, the
> `notify` file watcher, `migrate_agent_data`) to the **host** + `packages/domain`
> + the **pi runtime**. Treat `houston-*` crate names and `.rs` paths below as
> historical pointers; the concepts are current.

## Rule
If @houston-ai component renders it → `.houston/` folder.
If app-specific → `.houston/`.

## Layout

```
~/.houston/workspaces/workspaces.json   Workspace[] index: id, name, isDefault, createdAt, locale?
                                          (locale = optional per-workspace UI-locale override; absent = inherit global `locale` pref)
~/.houston/workspaces/{Workspace}/{Agent}/
  .houston/
    agent.json                  AgentMeta (id, manifest_id, created_at, last_opened_at)
    activity/
      activity.json             Activity[]
      activity.schema.json      JSON Schema
    routines/
      routines.json + .schema.json
    routine_runs/
      routine_runs.json + .schema.json
    config/
      config.json + .schema.json
    learnings/
      learnings.json + .schema.json   ({id, text, created_at})
      # Legacy `.houston/memory/learnings.md` auto-migrated on startup
      # (bullet list → JSON). See `houston_agent_files::migrate_agent_data`.
    prompts/
      modes/<mode>.md           editable per-mode prompt overlay (user-owned)
    sessions/
      anthropic/{session_key}.sid       current Claude resume id
      anthropic/{session_key}.history   all Claude resume ids used by this conversation
      anthropic/{session_key}.invalid   Claude resume ids rejected by the CLI
      openai/{session_key}.sid          current Codex resume id
      openai/{session_key}.history      all Codex resume ids used by this conversation
      openai/{session_key}.invalid      Codex resume ids rejected by the CLI
      {session_key}.sid                 legacy flat resume id, read as fallback only
  .agents/
    skills/<name>/SKILL.md      Claude Code skill convention
  .claude/
    skills/<name>               symlink → ../../.agents/skills/<name>
  CLAUDE.md                     agent instructions
  AGENTS.md                     symlink → CLAUDE.md (for Codex)
```

## File I/O path
Frontend never touches the filesystem directly. All `.houston/` reads
and writes flow through `@houston-ai/engine-client` → the **host** file
routes (`packages/host`), which read/write the workspace vfs. Writes are
atomic (unique temp + rename) and emit a matching `HoustonEvent` on the
`/v1/events` SSE channel. No typed CRUD — per-type folder + schema + a
generic read/write pair covers everything.

Typed JSON readers never let a corrupt data file brick the surface that
reads it (HOU-436: a malformed `routines.json` used to make every
`list_routines` call 500 with `json error: expected value at line 1 column
1`). Recovery is least-lossy first: a leading UTF-8 BOM is stripped before
parsing (serde rejects one); a whitespace-only file reads as the type
default; **unescaped control characters inside a string** (a raw newline/tab
an external editor, sync client, or agent spliced into a multi-line value)
are escaped in place and the document re-parsed — lossless, so every record
survives; a file with one valid value plus trailing junk keeps the first
value; any other unparseable file resets to the type default (`[]`, `{}`,
…). Every recovery that rewrites the file first copies the original bytes to
`.houston/<type>/<type>.json.corrupt-<timestamp>-<uuid>.bak` and logs a
warning, so nothing is lost silently.

The control-char step is load-bearing (HOU-494): these files are explicitly
multi-writer, so a non-Houston process (a `routines.json.tmp.<pid>.<hex>`
temp file unlike Houston's own `.<name>.<uuid>.tmp`) can leave a literal
newline inside a `prompt`. Without the lossless escape, that hit the reset
path and the recovery itself *wiped* every routine — exactly the data loss it
was meant to prevent. Reset is the last resort, for genuinely unrecoverable
bytes only.

## Schemas
Authoritative. Live in `ui/agent-schemas/src/*.schema.json`. `packages/domain` seeds them into each agent's `.houston/<type>/<type>.schema.json` on create. Prompts instruct the model to read the schema before writing a data file.

## Learnings prompt injection
`engine/houston-engine-core/src/agents/prompt.rs::build_agent_context`
injects `.houston/learnings/learnings.json` into each session as a
bounded, frozen-at-session-start background block. Only each entry's
`text` field is rendered; `id`, `created_at`, and any future metadata
stay storage/UI-only. Writes during a session persist immediately but are
not visible in the already-started prompt until the next session.

## Migration
The Rust intra-agent migration (`houston_agent_files::migrate_agent_data`) was **dropped** with the Rust engine. Chat-history migration — Rust-era transcripts → v3 conversations + a synthesized pi session — is now owned by the **TS host** and runs on boot (`packages/host` `src/migrate/*`; see `convergence/migration-gate.md`). It is copy-never-move, so it stays downgrade-safe. The product prompt is no longer a `.houston/prompts/*` seed; it lives in the host (`packages/host/src/houston-prompt.ts`), not on disk.

Session resume IDs are provider-scoped for new writes so Claude and Codex
never overwrite each other's current resume ID. Existing
`.houston/sessions/{session_key}.sid` files stay in place and are read as
a fallback until a provider writes its own scoped `.sid`. Chat history
loads the legacy ID plus every provider current/history ID for the same
session key. Provider-scoped `.invalid` files stop a rejected legacy ID
from being retried by the provider that rejected it.

## Atomic writes
All writes: unique temp file + rename. Path-traversal safe via `houston-agent-files::safe_relative`.

## Activity statuses
`running` · `needs_you` · `done` · `error` · `archived`

Each activity also persists an optional `pending_interaction` (the `{kind:"question"|"connect", …}` union the settled turn left the user to answer, validated in `packages/domain/src/activities.ts`): it rides the `needs_you` settle, is cleared to null at the next turn's start, and lets a question / connect card survive reload. How a turn picks `done` vs `needs_you` (the clean-settle split) → `knowledge-base/client-architecture.md`; the end-to-end tool → holder → card lifecycle → `knowledge-base/architecture.md`.

Source of truth: `ui/agent-schemas/src/activity.schema.json` (the embedded copy in `houston-agent-files::schemas` is `include_str!`'d from that one file; `seed_schemas` re-writes the on-disk per-agent copy on every open, so adding an enum value reaches existing users with no migration). The board renders `error` inside the **needs you** column with a red border so failed sessions don't vanish. `archived` is the only status with no board column: archived missions drop off the active board (and out of the agent-header search / arrow-nav / the needs-you badge / Mission Control) and surface in the per-agent **Archived missions** tab as a list (the UI relabels these surfaces **Completed** in en/es/pt; the internal status stays `archived`). The Archived tab carries its own search input (separate state from the active-board search) so archived missions stay findable by title + chat history (issue #382). Replying to an archived mission re-activates it — `sessions::start` flips it back to `running` via `set_status_by_session_key`, so it leaves the Archived tab and returns to the active board (issue #360). Bulk archive/move/delete run entirely in the TS data layer (`app/src/data/activity.ts` — one read-mutate-write per action, NOT per-id engine calls). Each board column header carries a kebab menu with "Select all in column" (Done + Needs you) that seeds a section-locked multi-selection; the floating bulk bar then drives archive/move/delete. Single activity delete is idempotent too: deleting a row that is already gone is a no-op, so double-clicks and stale selected panels do not surface false errors. The per-agent board also supports **drag & drop**: dragging a card onto another column patches its status via `useUpdateActivity` (issue #399). The drop rule reuses the bulk-move rule exactly — only `needs_you` ⇄ `done`, never into `running` (a session does that), never its own section — and lives in `canDropMission` (`app/src/lib/mission-selection.ts`). The mechanics (draggable cards, droppable columns, highlight) are generic and live in `@houston-ai/board` (`onItemMove` + `canDropItem` props, native HTML5 DnD); Mission Control passes neither yet, so its board has no DnD until that refactor lands. Any code path that may have flipped a row to `running` (optimistic UI write, engine `set_status_by_session_key("running")`) MUST guarantee a terminal status on exit — including cancel-of-queued and early start-failure, both handled in `engine/houston-engine-core/src/sessions/mod.rs`. Skipping the terminal flip leaves missions visibly stuck on "running" forever.

## Skills discovery
Skills live at `.agents/skills/<name>/SKILL.md`. Houston mirrors to `.claude/skills/<name>` via symlink (Claude Code reads). Flat `.md` under `.agents/skills/` auto-migrated to `<name>/SKILL.md` on next `list_skills`.

Same files surface in the UI as **Skills**. Frontmatter drives card image, category tabs, featured-state showcase, and integration logos. Selecting a Skill pins it above the regular composer; free-form text remains in chat. Full schema + render pipeline → [`skills.md`](skills.md).

## SQLite (minimal)
Only two tables:
- `chat_feed` - keyed by provider CLI session id (`claude_session_id` column name is legacy). UI conversation replay on restart.
- `preferences` — app-level (last_workspace_id etc). Not scoped.

Everything else lives in files.

User-message rows may include leading `<!--houston:skill ...-->` or
`<!--houston:attachments ...-->` markers (the legacy `<!--houston:action ...-->`
prefix is still decoded for chat history written before the rename). These are display metadata only;
the same row still contains the Claude-facing prompt body after the marker.
Renderers decode the marker so non-technical users see cards/badges instead
of file paths or internal prompt instructions.

## Session file-change attribution
Chat sessions snapshot user-visible project files before and after the
CLI run. The engine diffs those snapshots and persists a `file_changes`
feed item with `created` and `modified` absolute paths. The visible-file
filter is shared with the project file browser, so helper files such as
Python scripts, JSON, the agent role files (`CLAUDE.md` / `AGENTS.md` /
`GEMINI.md`), `.houston/`, `.agents/`, and dotdirs stay out of
non-technical chat summaries. Markdown deliverables the agent writes
(reports, plans, notes) DO surface — they are documents, not config
(issue #294). The allowlist + role-file denylist live in
`USER_EXTENSIONS` / `HIDDEN_ROLE_FILES` in
`engine/houston-engine-core/src/agents/files.rs`.

> This denylist is cosmetic chat-surface filtering, unrelated to Teams
> configure-scope enforcement. In multiplayer the cloud gateway separately
> GATES writes to root-instruction / protected-dir files (CLAUDE.md, skills)
> to agent-managers — see `knowledge-base/teams.md` and
> `cloud/docs/contracts/C7-teams.md`.

Attribution is strict only when one session owns a working directory. The
engine enforces that by holding a per-`working_dir` guard for chat and
routine sessions. Different worktrees/folders can run in parallel. A
second session in the same folder gets a conflict instead of producing a
false file summary.

## AI-native reactivity (MANDATORY)

Users + LLMs equal participants. Both read/write all workspace data. All changes visible to both immediately.

### Two writers
1. **Frontend via the engine** — user clicks "Create Activity" → React hook → `engine-client` → `houston-engine` REST route → `houston-agent-files` writes the file.
2. **CLI agent direct writes** — the claude/codex subprocess writes `.agents/skills/<name>/SKILL.md` or updates `.houston/<type>/<type>.json` directly without talking to the engine.

### Three-layer reactivity stack
1. **TanStack Query (frontend)** — all `.houston/` fetches via `useQuery`. Query keys: `["activity", agentPath]` etc. Dedup, background refresh, stale-while-revalidate.
2. **Event emission on engine writes** — the engine's write helpers emit `HoustonEvent` variants (`SkillsChanged`, `ActivityChanged`, `LearningsChanged`, …) onto its broadcast bus. The desktop WS client (`ui/engine-client`) fans them out; global listeners in `app/src/hooks/use-agent-invalidation.ts` invalidate the matching query key.
3. **File watcher on `.houston/` (Rust `notify`, `houston-file-watcher`)** — catches direct agent writes that bypass the engine's write path. Emits the same events onto the same bus. Debounced.

### The rule
Never build feature where agent changes data but UI won't reflect until refresh. If in `.houston/`, must be reactive.

## User data = upgrade-safe
Files under `~/.houston/**` (including legacy `~/Documents/Houston/**` from earlier versions) exist on user machines. Changing shape/layout requires **idempotent migration** on upgrade. See `houston_agent_files::migrate_agent_data`. Never leave existing users broken.
