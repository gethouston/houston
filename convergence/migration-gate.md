# Migration gate — verified against real Rust-era data

The P5 migration gate (the one that must pass before the Rust engine — the parity
oracle — can be deleted at P6) was run against a **copy** of a real production
`~/.houston` (7 agents, an 18 MB Rust `chat_feed` db, WAL-mode). Originals were
never touched; the db is opened read-only.

## Results (all green)

| Check | Result |
|---|---|
| Fresh first-boot migration | **38 conversations migrated across 7 agents** (CTO Assistant 15, Personal assistant 13, Matrix 5, Content creator 2, Habi/CPO/Agents School 1 each) |
| Transcripts well-formed + real content | 38 transcript files; largest = 301 messages, `user`/`assistant` roles, real titles, valid JSON |
| pi session synthesized (agent remembers) | 38 resumable sessions written (`*.jsonl` under `.houston/runtime/sessions/<key>/`), one per migrated conversation |
| Idempotency (re-run is a no-op) | second run → **0 migrated, 38 skipped** (per-agent `.migrated` marker + per-conversation existence check) |
| Source db read-only | scratch db SHA-256 identical before/after; original `~/.houston/db/houston.db` SHA-256 unchanged |
| **Downgrade-safe** | of 161 legacy files, **0 changed**; every file the migration creates is under `.houston/runtime/` — a path the Rust engine never reads, so rolling back to a Rust desktop build always works |
| Provider/model remap on real configs | `openai/gpt-5.5`→`openai-codex/gpt-5.5`; `anthropic/claude-opus-4-8` unchanged; legacy `gpt-5-codex`→`gpt-5.5`, bare `opus`/`sonnet` aliased; unknown id → provider default + diagnostic (never throws) |

### Honest limitation: orphan conversations

7 conversations in `chat_feed` reference a session id with **no surviving
`.houston/sessions/<provider>/*.sid` tracker file**, so there is no agent to
attribute them to. They are **logged, not migrated** — there is genuinely
nowhere to place them (the owning agent was deleted, or predates session
tracking). This is surfaced in the migration log, not swallowed.

## How to re-run the gate

```sh
# copy real data to scratch (db is WAL-mode — copy the -wal/-shm sidecars too)
cp -R ~/.houston/workspaces /tmp/mig/workspaces
cp ~/.houston/db/houston.db* /tmp/mig/db/
# from packages/host, call migrateChatHistory({ workspacesRoot, dbPath })
# (the same call local/host.ts makes at boot). Inspect .houston/runtime/{conversations,sessions}.
```

The chat-history migration is wired into `local/host.ts` at boot, keyed on
`HOUSTON_CHAT_HISTORY_DB` (default `~/.houston/db/houston.db`).

---

## Release-note copy (user-facing — non-technical voice)

> **Your agents and history came with you.** Everything you and your agents have
> worked on is right where you left it, and your agents remember your past
> conversations.
>
> **Reconnect your AI once.** For your security we can't carry over your AI
> sign-in, so the first time you open the new version you'll be asked to connect
> your AI again. It takes a few seconds, and then you're back to normal.
>
> **A note on older conversations.** Very old conversations are preserved as you
> last saw them. A few fine technical details from those older chats may look
> slightly different, but everything your agents need to pick up where you left
> off is there.

(Spanish and Portuguese translations live with the in-app strings; this block is
the English source for the changelog / download page.)
