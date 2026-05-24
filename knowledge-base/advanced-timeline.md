# Advanced: Timeline

Surfaced by the `advanced.timeline` flag in Settings → Advanced (Phase 4 of RFC #248).

## What it does

When the flag is on, every agent grows a **Timeline** tab next to its other tabs. The tab shows the union of all chat-feed entries across the agent's missions, newest first, in a single flat scroll list.

Each row carries:

- **Relative timestamp** (`5m ago`, `2h ago`, `3d ago`, localized via `Intl.RelativeTimeFormat`)
- **Type label** (You / Assistant / Tool / Tool result / System / Thinking / Final / Files / Error) with color coding
- **Single-line preview** of the event body (best-effort: tries `text`, `content`, `result`, `details`, `message` fields in the JSON payload)
- **Session id** (first 8 chars) so you can correlate rows back to specific missions

## Architecture

### Engine

| Layer | What |
|---|---|
| `engine/houston-db/src/repo_chat_feed.rs` | new `list_chat_feed_by_sessions(ids, limit)` query — `WHERE claude_session_id IN (...)` ordered by timestamp DESC |
| `engine/houston-engine-core/src/timeline.rs` | `timeline(state, { sessionIds, limit? })` — wraps the query, caps `limit` at 2000 (default 200) |
| `engine/houston-engine-server/src/routes/timeline.rs` | `POST /v1/timeline` — thin handler |

The engine has no concept of "agent" — it just unions sessions. The frontend owns the agent→sessions mapping.

### Frontend

| Layer | What |
|---|---|
| `app/src/hooks/use-timeline.ts` | `useTimeline(agentPath, limit?)` — reads agent activities, extracts session ids, calls `/v1/timeline` |
| `app/src/components/timeline/timeline-panel.tsx` | renders the list; preview-text decoder; relative-time formatter |
| `app/src/components/tabs/timeline-tab.tsx` | built-in tab adapter |
| `app/src/agents/tab-resolver.ts` | registers `timeline` in `BUILTIN_TABS` |
| `app/src/components/shell/workspace-shell.tsx` | injects the Timeline tab when the flag is on (no per-agent check — every agent has potential activities) |
| `app/src/locales/{en,es,pt}/timeline.json` | namespace strings |
| `app/src/locales/{en,es,pt}/settings.json` | `advanced.flags.timeline.{label,description}` |
| `app/src/locales/{en,es,pt}/agents.json` | `tabLabels.timeline` |

## Why it's gated

Power-user feature. Most agents finish work in a single mission and the activity tab is enough. Cross-session timelines matter for long-running, multi-mission agents (a research assistant that has accumulated 50 missions; a code agent that's been refactoring for weeks).

## Enforcement surface

`enforcementSurface: "ui"`. The `/v1/timeline` route is always on. Custom frontends consuming the engine directly can use it without the flag.

## Limits

- Default fetch caps at 200 events
- Hard ceiling at 2000 (server-side `MAX_LIMIT`)
- Footer line says "Showing the N most recent events." when the cap was hit
- v2 may add pagination + date-range filtering

## See also

- `knowledge-base/feature-flags.md` — the 12 rules + adding-a-flag procedure
- Sibling flags: `advanced-worktrees.md`, `advanced-context-meter.md`, `advanced-git-panel.md`
- RFC: `gethouston/houston#248`
