# iOS Parity Spec — Mission Control & Missions (mirrors desktop exactly)

> Extracted from the desktop app 2026-07-03 (all claims cited file:line at extraction time).
> HARD REQUIREMENT (founder): mobile uses exactly the same statuses, names, and affordances
> as desktop. This file is the enforceable contract for the iOS surfaces; update it via the
> normal inventory/procedures flow (knowledge-base/client-architecture.md) when desktop changes.
> Locale strings come from app/src/locales/en/*.json; es/pt mirror the same keys.

## 1. Status vocabulary

### Canonical wire statuses (the activity `status` field)
`packages/domain/src/activities.ts:11-17`, `ui/agent-schemas/src/activity.schema.json:15`:
`running · needs_you · done · error · archived`
Unknown statuses are preserved and rendered neutrally. New activities are created `status:"running"`.

### Live-turn status unions (SDK — `packages/sdk/src/modules/turns/feed-output.ts`)
| Type | Values | Meaning |
|---|---|---|
| `SessionStatusValue` | `starting` \| `running` \| `completed` \| `error` | Drives spinner (`running`), settle (`completed`), failure (`error`). `starting` is legacy — TS machinery never emits it. |
| `BoardStatus` | `running` \| `needs_you` \| `error` | Persisted board-card status once a turn settles. |

### THE critical needs_you-vs-error rule
`packages/sdk/src/modules/turns/vm-output.ts:36-47`: a user **Stop** (and a logged-out provider)
settles `sessionStatus === "error"` **but** `boardStatus === "needs_you"`. **Read the pair, never
`sessionStatus` alone** — keying off sessionStatus renders a normal Stop as red.
`boardStatus:"needs_you"` = handled / your attention; `boardStatus:"error"` = genuine failure.
`ConversationVM` exposes `{ feed, running, sessionStatus, boardStatus }`.

### Board columns (kanban) — `app/src/components/mission-board-columns.ts`
Left-to-right order and status→column mapping (single source of truth):
| Order | Column id | Label (`dashboard.json:columns`) | Statuses mapped | Extras |
|---|---|---|---|---|
| 1 | `running` | **Running** | `running` | has `+` New-mission add button |
| 2 | `needs_you` | **Needs you** | `needs_you`, `error` | — |
| 3 | `done` | **Done** | `done`, `cancelled` | — |
| — | (none) | — | `archived` → never on the active board | |

`cancelled` is a tolerant alias folded into Done, not a canonical activity status.
**There is no backlog/todo column. Three columns only.**

### Card color/glow semantics — `ui/board/src/kanban-card.tsx`
- `running` → `card-running-glow` animated conic border + blue shadow `rgba(59,130,246,0.12)`.
- `error` → `border-destructive/60`.
- `needs_you` → renders the Approve check button ("Move to done").
- selected/highlighted → `bg-accent`.

## 2. Archive semantics
- Archiving = the activity `status` field set to `"archived"` (`ARCHIVED_STATUS`, `app/src/lib/mission-selection.ts:9`). No separate flag.
- Desktop affordance: multi-select → bulk bar "Archive" (`board.json:bulk.archive`); confirm dialog
  `bulk.confirmArchive`: title "Archive missions?", body "Archive {{count}} mission? You can reopen
  it from the Archived tab." No per-card archive icon on desktop (per-card icons: Approve / Rename / Delete).
  iOS uses explicit per-item actions instead of multi-select (see §7).
- Drag-and-drop does NOT archive; drop targets are only `done`/`needs_you`.
- Archived is visible in the **Archived** view (toolbar toggle, label "Archived",
  `dashboard.json:archived.button`) — cross-agent list layout, and per-agent tab.
- **Reversible by replying**: sending in an archived chat re-activates it (engine flips
  `archived → running` on session start). Empty state: "Archived missions appear here.
  Reply to one to bring it back." (`board.json:archived.emptyDescription`).
- Active lists exclude `archived`; the archived list includes only `archived`. Search runs identically over both.

## 3. Mission Control layout & card anatomy
`KanbanItem` shape: `ui/board/src/types.ts`. Card build: `app/src/components/use-mission-control.ts:105-130`.
| Card field | Source | Notes |
|---|---|---|
| title | activity title | AI-generated async after create; fallback = truncated first message. Rename via pencil. `line-clamp-2`. |
| description | `messagePreviewText(description)` | User's first message; `<!--houston:...-->` markers decoded. `line-clamp-2`. |
| group (above title) | `agent_name` | muted |
| icon | `AgentCardAvatar{color}` | colored Houston helmet |
| tags | `missionCardTags(...)` | e.g. "Routine" (`board.json:tags.routine`), agent-mode pill |
| updatedAt | `updated_at` | |
| metadata | `agentPath, sessionKey, agent?, routineId?` | routing/session addressing |

- Agent filter: default "All agents" (`dashboard.json:filter.allAgents`); filters `metadata.agentPath`.
- Header: "Mission Control" (`dashboard.json:title`); archived view header "Archived".
- **Search** (`app/src/components/mission-search.ts` + `use-mission-search.ts`): matches title,
  then description, then lazily-loaded chat history content (per feed item: `user_message` text,
  `tool_call` name+input, `tool_result` content, `file_changes` paths, `final_result` result).
  History loaded only for missions not already matching, with `observe:false`.
  Placeholder "Search missions"; matches show a highlighted snippet under the title.
- Empty states: board "No conversations yet" / "Start a new conversation to delegate work to an
  agent." + "New mission" CTA; search-empty "No matching missions" / "Try a different search or
  clear the current one."; searching "Searching mission text" / "Looking through older messages
  now."; history-load error toast "Couldn't search every mission" / "Some older mission text could
  not be loaded."; no-agents "No agents yet" / "Build your AI team and ship the impossible."

## 4. Agent presentation
- Avatar = `HoustonAvatar` (`ui/core/src/components/houston-avatar.tsx`): colored circle
  (`color-mix secondary 82% + agentColor 18%`) with the Houston helmet SVG glyph (~65% size).
  **No initials, no photos** — always the helmet tinted by `agent.color` (fallback `#9b9b9b`).
  `running` → comet-glow halo wrap.
- Per-agent status aggregation (`app/src/components/shell/agent-activity-summary-model.ts`):
  counts of that agent's conversations by status → `{ needsYouCount, runningCount }`.
  Rendering: runningCount>0 → avatar running-glow; needsYouCount>0 → outline `NeedsYouChip`
  badge with the count (caps "99+"). Labels (`shell.json`): "{{count}} issue running" /
  "{{count}} issue needs you" (+ plurals).
- Busy rule: a session is busy if activity `status==="running"` OR live sessionStatus active OR
  optimistically started — externally-started sessions (routines, other surfaces) count as busy.

## 5. Mission chat feed catalog
`FeedItem` union: `ui/chat/src/types.ts`. Fold: `ui/chat/src/feed-to-messages.ts`.
| feed_type | Renders as | Copy / notes |
|---|---|---|
| `assistant_text` / `_streaming` | assistant bubble | streaming carries cumulative full text → updates ONE bubble in place; final flushes the same bubble |
| `thinking` / `_streaming` | reasoning block | "Thinking..." while active; "Thought for {{count}} seconds" / "Thought for a few seconds" (`chat.json:reasoning`) |
| `user_message` | user bubble | author label only when ≥2 distinct authors |
| `tool_call` | tool chip (name + input) | deduped (placeholder null-input replaced) |
| `tool_result` | attached to its tool chip | `{content, is_error}` |
| `tool_runtime_error` | system message | "A local tool failed to start." + typed detail; retry "Try again." |
| `provider_error` | typed ProviderErrorCard | 12 kinds (`ui/chat/src/types.ts:105-163`); `kind:"cancelled"` is DROPPED (no UI); duplicates collapsed per turn |
| `system_message` | system line | suppressed when a typed card already covered the same `Session error:` |
| `context_compacted` | subtle divider | "Earlier conversation summarized so the chat can keep going" |
| `provider_switched` | subtle divider | "Continued with {{provider}}" / "Continued with {{provider}}, summarized to fit" |
| `file_changes` | file-change list on the assistant msg | "Updates made", "1 new file"/"{{count}} new files", "1 file updated"/"{{count}} files updated" |
| `final_result` | flush → turn summary "Mission log" | `{result, cost_usd, duration_ms, usage}` |

Status lines (`chat.json:process`): active = "Mission in progress..."; with action =
"Mission in progress: {{action}}"; settled = "Mission log". Shimmer while active.
**There is NO "Stopped by user" string** — a Stop moves the card to Needs you silently
(the `cancelled` provider_error is dropped).

## 6. New-mission flow (wire) — `app/src/lib/create-mission.ts`
1. Create activity (`status:"running"`), id → session key `activity-{id}`.
2. Send the first message — creation IS activity+first send; no separate create-conversation call.
3. Title: `fallbackMissionTitle(text)` immediately (trim, ~40-char word-boundary truncate,
   "New mission" if empty); async AI title refresh afterwards unless an explicit title was given.
4. On send failure → rollback deletes the activity (no fake running card).
- Agent picker copy: "Which agent should run this?" / "Pick an agent to open a fresh conversation."

## 7. Desktop-only — iOS must NOT replicate
- Drag-and-drop between columns → iOS uses explicit move/approve actions.
- Multi-select + floating bulk bar + "Select all in column" + hover-reveal checkboxes.
- Keyboard navigation.
- Run-in-terminal / worktree affordances.
- Model selector, reasoning-effort picker, provider-switch dialogs (desktop chrome).
- Bulk move targets deliberately exclude `running` (you enter running by sending), `error`, `archived`.
