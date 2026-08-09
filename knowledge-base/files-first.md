# Files-First (`.houston/`)

Houston uses files, not a DB, for everything. The only SQLite left is a read-only migration source (see below).

> **Authority differs by deployment (read this first).** On **desktop and
> self-host** the `.houston/` files ARE the authority — the local disk is ground
> truth, exactly as this doc describes. On **managed cloud** they are NOT: the
> pod's `/data` is a **disposable cache** of the gateway's object store. The host
> hydrates it on boot (`HOUSTON_STORE_URL` set → `StoreSyncDaemon.hydrate()` must
> succeed before HTTP listen), the runtime reads/writes the local files as usual,
> and a debounced `syncBack` mirrors every write to the store
> (`PUT /v1/pod/store/{org}/{agent}/objects/...`, host-token auth) — the store is
> authoritative and the pod is replaceable (`packages/host/src/store-sync/`,
> `packages/host/src/local/host.ts` `start()`). So everywhere below, read "the
> file is the source of truth" as **the LOCAL representation** the app and agent
> read/write; on managed cloud its durable copy lives in the object store, and a
> fresh pod is expected to boot empty and rehydrate. The layout, atomic-write
> discipline, schemas, and reactivity model are identical in both worlds.
>
> **Canonical chat storage:** v3 conversation transcripts live under
> `.houston/runtime/conversations/`; pi session state lives under
> `.houston/runtime/sessions/`. The host file watcher classifies writes to both
> as `ConversationsChanged`, which the gateway fans to every client so an open
> chat on another device reloads the same transcript.

## Rule
If @houston-ai component renders it → `.houston/` folder.
If app-specific → `.houston/`.

## Layout

Generated from the layout constants: `packages/domain/src/layout.ts`
(`docKey`/`schemaKey`/`skillsDirKey`/`sharedSkillsDirKey`/`storePublicationKey`),
`packages/domain/src/skills-manifest.ts`, and `packages/host/src/paths.ts`
(`LocalPaths`, which puts `dataRoot` at `<Agent>/.houston/runtime`).

```
~/.houston/workspaces/                  FsVfs root. A workspace IS a directory here —
                                        no index file (LocalWorkspaceStore lists dirs,
                                        skipping dot-names).
  {Workspace}/
    .shared/
      skills/<slug>/SKILL.md            workspace-shared skills, ONE copy (ADR 0003)
    {Agent}/
      .houston/
        activity/
          activity.json                 Activity[]
          activity.schema.json          JSON Schema (re-seeded every host boot)
        routines/
          routines.json + .schema.json
        routine_runs/
          routine_runs.json + .schema.json
        config/
          config.json + .schema.json
        learnings/
          learnings.json + .schema.json   ({id, text, created_at}
                                           + optional provenance: taught_by
                                           {user_id,name?}, mission_id, mission_title)
        skills-manifest/
          skills-manifest.json          {version, enabled[]} — which .shared skills
                                        THIS agent loads. Absent = nothing enabled.
        store-publication/
          store-publication.json        Agent Store listing pointer (storeAgentId,
                                        share slug/url). Deliberately NOT a typed
                                        family: no seeded schema, machine-local,
                                        never exported in a `.houstonagent`.
        runtime/                        HOUSTON_DATA_DIR — the runtime's own state
          conversations/<cid>.json      v3 transcripts (canonical chat storage)
          sessions/<conversationId>/    pi session JSONL
          settings.json
          auth.json                     provider credentials, atomic 0600 writes
      .agents/
        skills/<slug>/SKILL.md          agent-owned skills (Agent Skills standard)
      CLAUDE.md                         agent instructions
```

Legacy files that may still sit in an upgraded tree, read but never written:
`.houston/agent.json` (Rust-era `AgentMeta`; only its `color` is still read, by
`packages/host/src/routes/agent-legacy-color.ts`), `.houston/sessions/**`,
`.claude/skills/<slug>`, and `AGENTS.md` / `GEMINI.md` symlink mirrors of
CLAUDE.md.

**There is no on-disk prompt overlay.** Mode overlays are hardcoded TS constants
(`PLAN_MODE_OVERLAY` / `AUTO_MODE_OVERLAY` in
`packages/runtime/src/session/mode-overlays.ts`), the product prompt lives in
`packages/host/src/houston-prompt.ts`, and the boot migration
(`packages/host/src/migrate/agent-layout.ts`) DELETES the legacy
`.houston/prompts/{system,self-improvement}.md` seeds.

## File I/O path
Frontend never touches the filesystem directly. All `.houston/` reads
and writes flow through `@houston-ai/engine-client` → the **host** file
routes (`packages/host`), which read/write the workspace vfs. Writes are
atomic (unique temp + rename) and emit a matching `HoustonEvent` on the
`/v1/events` SSE channel. No typed CRUD — per-type folder + schema + a
generic read/write pair covers everything.

**A mangled data file surfaces; it is never silently reset.** `loadJson`
(`packages/domain/src/store.ts`) reads a missing file as the caller's fallback,
strips a leading UTF-8 BOM (an encoding artifact `JSON.parse` rejects outright —
HOU-953, and the vfs's `decodeText` drops it too so every `TextStore` impl
agrees), and **throws with the key named** on anything else that will not parse.
Resetting to `[]` would destroy the user's records on the next write, which is
the worse failure.

Per-FIELD garbage IS tolerated, once the document parses: `normalizeRoutines`,
`normalizeActivities`, `normalizeSkillsManifest` and friends drop the bad entry
or key rather than rejecting the file. These files are explicitly multi-writer,
so tolerating a stray field is correct — tolerating unparseable bytes is not.

Concurrent readers never see a torn file: `writeBytes` renames a scratch file
into place, named with `ATOMIC_TMP_SUFFIX` (`.houston.tmp`) so the Files tab and
the store sync can filter Houston's own in-flight temps out of a listing
(HOU-1176).

**`routines.json` has ONE blessed write path — never a wholesale agent write.**
Each routine's setup chat is isolated and only knows its own routine. The prompt
USED to tell the agent to write `.houston/routines/routines.json` wholesale with
file tools, so creating routine #2 overwrote the file with a one-element array —
**deleting routine #1** (same class of silent data loss as HOU-436/HOU-494, but
from the AGENT, not a corrupt reader). Fix: the agent now saves ONLY through the
`save_routine` runtime tool, which posts to the host's merge-safe route
(`packages/host/src/routes/routine-write.ts`: `loadRoutines → create/apply →
upsertById → saveRoutines` — read-modify-write, so a second save never clobbers
the first). The product prompt (`packages/host/src/houston-prompt-routines.ts`)
FORBIDS the direct write ("NEVER write, edit, or run a command that changes
`.houston/routines/routines.json`… use the `save_routine` tool — it is the ONLY
way to save one"); reading the file to check what exists is still allowed. The
frontend's own writes (form toggle, inline schedule edit, delete) go through the
same host route, so both writers stay merge-safe.

Each routine carries EXACTLY ONE wake mechanism — a cron `schedule` OR a
`trigger`. The trigger is a `kind`-discriminated union
(`ui/agent-schemas/src/routines.schema.json`,
`packages/protocol/src/domain/routine.ts`): `kind` **absent** = a Composio binding
(`{toolkit, trigger_slug, trigger_config, connected_account_id?}`), so routines
written before webhook wakes existed load unchanged (no migration);
`{kind:"webhook", key_prefix?}` = an incoming-webhook binding (the URL + secret are
gateway-minted and NEVER stored here; `key_prefix` is a display-only "wh_xxxxxxxx"
label). `normalizeRoutines` drops any entry that has both wakes or neither, so the
host validates the exactly-one invariant BEFORE writing (a wake-less write would
vanish on the next read).

## Schemas
Authoritative. Live in `ui/agent-schemas/src/*.schema.json`. `packages/domain` seeds them into each agent's `.houston/<type>/<type>.schema.json` on create. Prompts instruct the model to read the schema before writing a data file.

Schemas are seeded on agent creation AND re-seeded on every host boot
(`packages/host/src/migrate/agent-schemas.ts`, content-compared so a
steady-state boot writes nothing) — an agent created before a schema gained a
field would otherwise keep a stale `additionalProperties: false` copy and strip
what the host stamps.

## Learnings provenance (HOU-946) — on-disk shape

A learning record in `.houston/learnings/learnings.json` may carry three
optional, additive provenance keys (no migration; older entries read unchanged):

```json
{
  "id": "…", "text": "…", "created_at": "…",
  "taught_by": { "user_id": "…", "name": "Julian" },
  "mission_id": "act-1",
  "mission_title": "Q3 pipeline"
}
```

All three are **server-stamped, never agent-written**. The mechanism (write
route, stamping rules, portability, UI) is documented once in
`knowledge-base/architecture.md` → "Learnings (memory) + their provenance".

## Learnings reach the model as a file, not a prompt block

Nothing injects `learnings.json` into the system prompt. The product prompt
(`packages/host/src/houston-prompt.ts`) tells the agent it may READ
`.houston/learnings/learnings.json` to see what is already remembered, and that
writing it with file tools is forbidden — `save_learning`
(`packages/runtime/src/session/tools/save-learning.ts` →
`POST /sandbox/learnings/save`, `packages/host/src/routes/learnings-sandbox.ts`)
is the only save path, because it merges instead of overwriting and stamps the
provenance keys above.

## Migration

Boot migrations live in `packages/host/src/migrate/` and are called from
`packages/host/src/local/host.ts` `start()`. All are idempotent and
copy-never-move, so a downgrade still finds its data.

- `agent-layout.ts` — flat `.houston/<f>.json` → `.houston/<f>/<f>.json`;
  `.houston/memory/learnings.md` bullets → `learnings.json`; deletes the legacy
  `.houston/prompts/{system,self-improvement}.md` seeds.
- `agent-schemas.ts` — re-seeds every family's `.schema.json`, content-compared.
- `chat-history.ts` — Rust-era transcripts → v3 conversations + a synthesized pi
  session under `.houston/runtime/`. See `convergence/migration-gate.md`.
- `linkage.ts` — the ONLY reader of the Rust-era
  `.houston/sessions/<provider>/<session_key>.{sid,history}` tracker tree. It
  gathers every provider resume id for a session key so the migration can link
  old transcripts to the right conversation. Nothing writes that tree anymore.

## Atomic writes

- Every vfs write is unique-temp-file + rename (`packages/host/src/vfs/fs.ts`
  `writeBytes`) — a concurrent reader never catches a half-written file.
- Path traversal is rejected at the port, before any impl maps a key:
  `assertSafeKey` (`packages/host/src/vfs/vfs.ts`) refuses absolute keys and any
  `.` / `..` / empty segment.

## Activity statuses
`running` · `needs_you` · `done` · `error` · `archived`

**The engine only ever writes `running` / `needs_you` / `error`.** Every settled non-failure turn lands `needs_you`; a genuine failure lands `error`; both render in the **Needs you** column. `needs_you` therefore means "finished (or blocked, or errored) and awaiting the user's review" — which is why the sidebar agent rows' needs-you badges count every such mission (`app/src/components/shell/agent-activity-summary-model.ts` behind `use-agent-activity-summaries.ts`, read by `sidebar.tsx` → `agent-sidebar-items.tsx`): that set is the review inbox, by design. `done` is written exclusively by a user action (card checkmark, drag into Done, bulk move), each firing the mission-done confetti.

Each activity also persists an optional `pending_interaction` (a `{ steps: [...] }` sequence the settled turn left for the user — blocking question/connect/plan steps and/or the optional `suggest_actions` / `suggest_reusable` offers, validated in `packages/domain/src/activities.ts`): it rides the `needs_you` settle, is cleared to null at the next turn's start, and lets the card survive reload. It describes what the card SHOWS, never which status it settled on. The end-to-end tool → holder → card lifecycle → `knowledge-base/architecture.md`; the `sessionStatus`/`boardStatus` pair → `knowledge-base/client-architecture.md`.

**Moving a mission to Done strips the blocking steps, keeps the offers.** Closing a mission is the user's own move and answers whatever it was waiting on, so a patch that sets `status: "done"` without carrying its own `pending_interaction` filters the stored steps down to the non-blocking clean-finish offers (`suggest_actions` / `suggest_reusable`) and deletes the key when none survive — a Done card can never show a question stepper, while "what to do next" and "save this as a Skill" keep rendering on it. One rule, three write paths: `retainSuggestionSteps` (`packages/protocol/src/domain/interaction.ts`) is applied by `applyActivityUpdate` (host PATCH, `packages/domain/src/activities.ts`), by `applyActivityPatch` (the app's local single + bulk writes, `app/src/data/activity-bulk.ts`), and by the fake host's `updateActivity`. Dismissing ONE offer in the chat panel is a per-step write, not a clear: `removeInteractionStep` (`app/src/lib/interaction-dismiss.ts`) persists the interaction minus that step through `usePersistedInteraction`, so skipping the action bubbles leaves the save-as-reusable card alive after a reload.

Two optional **per-mission attribution** fields (hosted Teams only): `created_by` (the id of the human who created the mission) and `contributors` (`{user_id, name?}[]`, everyone who started or collaborated). Both are **server-stamped, never agent-written** — the host derives them from the gateway's `x-houston-acting-as` header (`packages/host/src/auth/acting.ts`) on mission create, PATCH edit, and each user turn, and only when `deps.gatewayFronted`. Desktop / self-host / single-player stamps nothing, so an `activity.json` there stays **byte-identical** (no attribution keys). `normalizeActivities` drops a non-string `created_by` and sanitizes `contributors`; the writes live in `createActivity` / `applyActivityUpdate` (`packages/domain/src/activities.ts`) and `stampTurnAttribution` (`packages/host/src/routes/activity-attribution.ts`, matched by `session_key` or `activity-<id>`, best-effort, never blocks a turn). Client surface (face stacks + filter) → `knowledge-base/teams.md`.

- Source of truth for the enum: `ui/agent-schemas/src/activity.schema.json`. The
  per-agent on-disk copy is re-seeded every host boot, so adding a value reaches
  existing users with no migration.
- **Every path that writes `running` MUST write a terminal status
  (`needs_you` / `error`) on exit.** The SDK turn stream writes `running` at turn
  start and always persists a terminal on settle
  (`packages/sdk/src/modules/turns/turn-stream.ts`). Skipping the terminal flip
  leaves missions stuck on "running" forever.
- Bulk archive/move/delete are one read-mutate-write in the TS data layer
  (`app/src/data/activity.ts`), never per-id engine calls. Single delete is
  idempotent — deleting an already-gone row is a no-op.

How the board renders and mutates these statuses (columns, the Archived view,
card actions, drag & drop) → `knowledge-base/board-shell.md`.

## Skills discovery
Skills live at `.agents/skills/<slug>/SKILL.md` — one tree, no `.claude/skills` mirror. `loadSkillsFromDir` (`packages/domain/src/skills.ts`) lists only keys ending in `/SKILL.md`, so a flat `.md` dropped under `.agents/skills/` is simply not a skill. Workspace-shared skills live once under `<Workspace>/.shared/skills/` and are opted into per agent by `.houston/skills-manifest/skills-manifest.json` (ADR 0003).

Same files surface in the UI as **Skills**. Frontmatter drives card image, category tabs, featured-state showcase, and integration logos. Selecting a Skill pins it above the regular composer; free-form text remains in chat. Full schema + render pipeline → [`skills.md`](skills.md).

## SQLite is a MIGRATION READER only

Houston writes no database. The only SQLite left is the Rust-era
`~/.houston/db/houston.db`, opened **read-only** by
`packages/host/src/migrate/sqlite.ts` so `chat-history.ts` can copy the old
`chat_feed` rows into `.houston/runtime/conversations/` on boot. The source db
is never modified, locked, or deleted.

Everything live is a file: transcripts under `.houston/runtime/conversations/`,
per-workspace preferences as one JSON doc via the vfs (`prefDocKey`,
`packages/domain/src/preferences.ts`), everything else under `.houston/`.

## Message markers

A persisted user-message body may start with a `<!--houston:skill ...-->` or
`<!--houston:attachments ...-->` marker (the legacy `<!--houston:action ...-->`
prefix is still decoded for chat history written before the rename). These are display metadata only;
the same body still contains the model-facing prompt after the marker.
Renderers decode the marker so non-technical users see cards/badges instead
of file paths or internal prompt instructions.

## Session file-change attribution

Each turn snapshots the workspace's user-visible files before and after, diffs
them, and emits a `file_changes` frame with workspace-RELATIVE `created` /
`modified` paths (`packages/runtime/src/session/file-changes.ts`).

**Visibility is a DENYLIST, not an allowlist.** There is no `USER_EXTENSIONS`
set — an extension-based allowlist was the Rust port's rule and it hid real
deliverables (an agent creating a file named `ping` showed in the Files tab but
produced no chat card). Only three things are hidden now:

- anything whose name starts with `.` (dot-files and dot-dirs, so `.houston/`
  and `.agents/` never surface),
- the seeded role files — `HIDDEN_ROLE_FILES` = `claude.md` / `agents.md` /
  `gemini.md`, case-insensitive — otherwise every agent's first session would
  claim it wrote its own instructions (issue #294),
- scaffolding dirs in `SKIP_DIRS` (`node_modules`, `__pycache__`, `venv`,
  `target`, `dist`, `build`, `skills`, `scripts`).

Everything else surfaces, which matches the Files tab's listing exactly — the
two surfaces must never disagree about whether the agent "made a file".

> This denylist is cosmetic chat-surface filtering, unrelated to Teams
> configure-scope enforcement. In multiplayer the cloud gateway separately
> GATES writes to root-instruction / protected-dir files (CLAUDE.md, skills)
> to agent-managers — see `knowledge-base/teams.md` and
> `cloud/docs/contracts/C7-teams.md`.

Attribution is strict only when one session owns a working directory. The
runtime enforces that with a per-workdir guard
(`packages/runtime/src/session/workdir-lock.ts`, canonicalized so `dir` and a
symlinked alias share one lock). Different folders run in parallel; a second
session in the SAME folder gets a conflict instead of a false file summary.

## AI-native reactivity (MANDATORY)

Users + LLMs equal participants. Both read/write all workspace data. All changes visible to both immediately.

### Two writers
1. **Frontend via the host** — user clicks "Create Activity" → React hook → `@houston-ai/engine-client` → a host route (`packages/host/src/routes/`) → the vfs writes the file.
2. **Agent direct writes** — the pi runtime's file tools write `.agents/skills/<slug>/SKILL.md` or `.houston/<type>/<type>.json` straight to disk, never through a host route.

### Three-layer reactivity stack
1. **TanStack Query (frontend)** — all `.houston/` fetches via `useQuery`. Query keys: `["activity", agentPath]` etc. Dedup, background refresh, stale-while-revalidate.
2. **Event emission on host writes** — the host's write routes emit `HoustonEvent` variants (`SkillsChanged`, `ActivityChanged`, `LearningsChanged`, …) onto the `/v1/events` SSE channel. `@houston-ai/engine-client` fans them out; global listeners in `app/src/hooks/use-agent-invalidation.ts` invalidate the matching query key.
3. **Host file watcher (`packages/host/src/watch/`)** — catches direct runtime and agent writes that bypass host routes. It classifies canonical `.houston/runtime/{conversations,sessions}/**` writes as `ConversationsChanged`, emits onto the host `/v1/events` channel, and debounces bursts. In managed cloud, the gateway's pod-event fan-in republishes that event to every connected client for the user.

### The cross-agent aggregate (`["all-conversations", ...paths]`) — HOU-981

Mission Control, the sidebar badges, the mentions inbox and the command palette
all read ONE query whose `queryFn` fans out a read per agent. In hosted mode
every one of those reads can wake a pod, so this query has its own rules
(`app/src/hooks/queries/use-conversations.ts`):

- **Finite freshness window, never `Infinity`.** The aggregate is persisted to
  IndexedDB (`query-persist-policy.ts`) and restored carrying its ORIGINAL
  `dataUpdatedAt`. With `staleTime: Infinity` a restored copy was permanently
  fresh, so nothing revalidated it for the whole session and every mission
  created while the app was closed stayed invisible. `ALL_CONVERSATIONS_STALE_MS`
  (10 min) revalidates the boot while a mid-session navigation reuses the cache.
  Do NOT "fix" this with `refetchOnMount: "always"` — seven surfaces mount the
  hook and each mount would re-fan-out to the whole fleet.
- **Partial-tolerant fan-out.** The adapter uses `Promise.allSettled` and returns
  `{ conversations, failedAgentPaths }` (`AllConversationsResult`); it throws only
  when EVERY agent failed. A partial sweep carries the failed agents' last-known
  rows forward and schedules a bounded re-sweep + one error toast
  (`lib/all-conversations-recovery.ts`).
- **Reconnect catch-up.** `/v1/events` has no replay cursor, so the adapter emits
  `EventStreamReconnected` on every RE-connect (`cp/events.ts` `onConnect`) and
  `agent-invalidation-plan.ts` turns it into a re-sweep of this key alone.
- **Errors never render "no missions".** Mission Control gates `isLoaded` on
  SUCCESS and falls back to the cached snapshot on error, so the empty-board
  auto-open composer only fires on a genuinely empty successful read.

### The rule
Never build feature where agent changes data but UI won't reflect until refresh. If in `.houston/`, must be reactive.

## User data = upgrade-safe
Files under `~/.houston/**` (including legacy `~/Documents/Houston/**` from earlier versions) exist on user machines. Changing shape/layout requires an **idempotent migration** on the host's boot path — add it beside the others in `packages/host/src/migrate/` and call it from `packages/host/src/local/host.ts` `start()`. Never leave existing users broken.
