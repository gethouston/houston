# P5 migration plan — Rust-era desktop data → single-engine host

**Status: PROPOSAL — needs sign-off before building** (per the no-break-user-data rule).
Goal: an existing Rust-desktop user upgrades to the host-sidecar build and keeps their stuff — agents, settings, board, routines, learnings, skills, instructions, **and chat history** — with a one-time reconnect for credentials. Downgrade to the Rust build must always still work.

## The good news: almost nothing needs migrating

The host-sidecar desktop sets `HOUSTON_WORKSPACES_ROOT = ~/.houston/workspaces` — the **same tree the Rust app already wrote**. And `LocalPaths` preserves the human layout. So these carry over with **zero migration** (the host reads them in place, shapes already match `@houston/domain`):

| Data | Where | Migration |
|---|---|---|
| Workspaces + agents (the tree) | `~/.houston/workspaces/<W>/<A>/` | none — read in place |
| `.houston/{config,activity,routines,routine_runs,learnings}` | per-agent | none — schemas identical (already flattened + alias-rewritten by the Rust-era `migrate_agent_data`) |
| `CLAUDE.md` | per-agent | none — pi discovers it natively |
| Skills (`.agents/skills/<slug>/SKILL.md`) | per-agent | none — pi-native format |
| Model IDs in `config.json` | per-agent | none — already explicit versions (`opus`→`claude-opus-4-7` etc.); pi's `getModel` resolves them |

**So the ONLY real migration target is chat history**, which the Rust app stored *outside* the tree, in SQLite.

## The one thing to migrate: chat history (SQLite `chat_feed` → v3)

- **Source**: `~/.houston/db/houston.db`, table `chat_feed(id, claude_session_id, feed_type, data_json, source, timestamp)`. A conversation = all rows sharing a `claude_session_id`, ordered by `id`. `feed_type`+`data_json` encode each item (user msg / assistant msg / tool call / thinking).
- **Agent linkage (VERIFIED against real data — corrected)**: activities do NOT carry the session id (`activity.claude_session_id` is `null`). The real link is the **session-id-tracker files**: `.houston/sessions/<provider>/<session_key>.sid` (+ `.history`), where `session_key = activity-<id>` and the file's content IS the `chat_feed.claude_session_id`. So the migration is **driven by the `.sid`/`.history` files per agent**: for each `<session_key>.sid`/`.history` → collect its claude_session_id(s) (union across `.history` rotations AND across the `anthropic/`+`openai/` provider dirs — a conversation can span both) → pull all `chat_feed` rows for those ids ordered by `timestamp` → that's one conversation, keyed `<session_key>` (= `activity-<id>`, so the board card links straight to it).
- **Orphans**: on the reference dataset, **39 / 46** conversations link via `.sid`/`.history`; **7** have no session file (deleted activities whose `chat_feed` rows persisted). Orphans are **logged with a count, not migrated** (they can't be placed on an agent — there is no agent/workspace column in `chat_feed`). Never a silent drop.
- **Reconstruction (real `feed_type`s)**: `user_message` (data_json = the text string) → a user message; the assistant turn's text = the `final_result.result` for that turn (clean + complete; falls back to concatenated `assistant_text` chunks if no `final_result`). `tool_call`/`tool_result`/`thinking`/`file_changes`/`provider_error` → rendered in the **transcript** but NOT fed to the pi session (the agent-memory side is user/assistant text only).
- **Target (local-host layout)**: `~/.houston/workspaces/<W>/<A>/.houston/runtime/`
  - `conversations/<conversationId>.json` — the **UI transcript** (always visible). `conversationId` = the activity's `activity-<id>` key, so the existing board card links straight to it.
  - `sessions/<conversationId>/` — a **synthesized pi session** so the agent *remembers* the chat: `SessionManager.create(workspaceDir, .../sessions/<id>)` + `appendMessage({role, content, timestamp})` for each user/assistant pair, in order (proven by `packages/runtime/src/session/resume.test.ts`; `continueRecent()` reloads it on the next turn).

### Fidelity (the honest caveat — this is the README's stated tradeoff)
- The **transcript** (`conversations/<id>.json`) can render the *full* old feed — user, assistant, tool calls, thinking — read-only. Nothing is lost to the user's eyes.
- The **agent's memory** (the pi session) gets plain **user/assistant text pairs only**. Tool-call and thinking blocks can't transfer between engines, so the agent remembers *what was said*, not the exact tool/thinking trace. We say so plainly.

## Not migratable (by design)
- **Credentials** — different OAuth clients (Rust CLI vs pi). One-time "Reconnect your AI" card on first launch. (Connect-once then re-shares across agents.)
- **Provider resume IDs** (`.houston/sessions/<provider>/*.sid`) — CLI-internal, meaningless to pi. Not migrated; pi manages its own session snapshots.

## Where + when it runs
**Recommendation: the local host migrates on startup, per-agent, idempotently.** The host is TS (has `SessionManager`/pi) and already walks the workspace tree; it can read the Rust SQLite via the host's tiny SQLite compatibility wrapper (`node:sqlite` under Node, `bun:sqlite` inside the compiled sidecar). On boot, for each agent: if a `.houston/runtime/.migrated` marker is absent AND `chat_feed` has rows for its activities → migrate, then write the marker. Idempotent (marker + per-conversation existence check), so re-runs are no-ops.

## Copy-never-move + downgrade (must hold)
- **Strictly additive**: we only WRITE new files under `.houston/runtime/`. We never modify or delete `houston.db` or any existing tree file.
- **Downgrade**: the Rust build keeps reading `houston.db` (untouched) and ignores `.houston/runtime/`. So a user can roll back to the Rust build and lose nothing. We verify this explicitly (downgrade test on real data).

## Testing
1. **Synthetic fixtures** — a hand-built `houston.db` + a fake agent tree; assert conversations + pi sessions are produced, `continueRecent()` restores the messages, idempotent re-run is a no-op, and the source db is byte-identical after.
2. **Real data** — run against a **copy** of a real `~/.houston` (the user provides one). Verify: board cards open their migrated transcripts, the agent remembers prior chats on the next turn, and the original `~/.houston` is untouched (downgrade-safe).

## Decisions needed from you
1. **Run location**: local host on startup (recommended) vs a one-shot migrate step the Tauri shell triggers. OK with on-startup?
2. **Fidelity**: confirm the transcript-full / agent-remembers-text-only split is acceptable (it's unavoidable cross-engine).
3. **UX**: silent migration + a one-time "Reconnect your AI" card (recommended), or a visible "bringing your data over…" screen?
4. **Real-data validation**: can you provide a **copy** of your real `~/.houston` (or point me at one) for the real-data test? Nothing destructive — copy-only.
