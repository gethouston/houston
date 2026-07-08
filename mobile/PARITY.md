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
`ConversationVM` exposes `{ feed, running, sessionStatus, boardStatus, queued? }` (`queued`
additive — see §5).

### BRIDGE addressing — the conversation VM scope (agent-qualified)
`packages/sdk/src/modules/turns/vm-output.ts:83-87` (`conversationScope`): the conversation VM is
published on **`conversation/<encodeURIComponent(agentPath)>/<encodeURIComponent(sessionKey)>`** —
agent-qualified, because a `sessionKey` is unique only WITHIN one agent. The `agentPath` segment is
the SAME string the surface passes as `agentId` to the `turns/*` commands (`index.ts:66,90-98` use
the command's `agentId` verbatim as the scope's agent segment), so the subscribe scope and the
publish scope stay in lockstep.
- **iOS**: `SdkScope.conversation(agentPath:sessionKey:)` builds it; every component is escaped by a
  from-scratch `encodeURIComponent` (unreserved set `A-Z a-z 0-9 - _ . ! ~ * ' ( )`, UTF-8 bytes,
  uppercase hex) — Foundation's `.urlQueryAllowed` is NOT equivalent. Pinned to JS-generated fixtures
  in `SdkScopeTests` (e.g. `"Houston/My Agent"` → `Houston%2FMy%20Agent`). A mismatch subscribes to a
  scope the SDK never publishes on → the chat feed goes dead, so this is a hard contract.

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

### iOS home rows — WhatsApp chat-list anatomy (waves 2+3, founder directive 2026-07-06)
The mobile Agents home restyles each agent as a WhatsApp chat-list cell. Native-only; the
aggregation (`needsYouCount`/`runningCount`) and avatar rules above are unchanged — this is layout.
- **Two-line cell** (`AgentRow.swift`) — line 1: agent name + right-aligned relative time
  (`Typography.caption`, `mutedFg`); line 2: preview text + a trailing **filled** `NeedsYouChip`.
- **Relative time** (`AgentRowTime.label`, from `AgentOverview.lastActivityAt` = most-recent
  mission `updatedAt`, parsed by `ActivityTimestamp`): today → short locale time (reuses
  `ChatBubbleTime`); yesterday → `Strings.Chat.Timeline.yesterday`; ≤6 days → weekday; older → short
  date. `nil` when no dated mission. Injectable `now`/`calendar`/`locale`; formatters pinned to the
  calendar's timezone.
- **Preview line — ONE signal per state** (`AgentRowPreview.derive`): running → "Working…"
  (`Strings.Chat.TitleBar.working`, accent-tinted) **whenever `runningCount > 0`, regardless of any
  needs-you count** — the filled `NeedsYouChip` is the sole needs-you signal, so the preview never
  repeats it (WhatsApp shows "typing…" even with an unread badge). No running mission → the
  last-activity line (`Strings.Agents.lastActivity`), which renders a **bare title** for `needs_you`
  (the badge carries the rest) and keeps **"Hit a snag on …"** for `error` (a genuine failure is
  information and carries no badge — the fold does not count `error` into `needsYouCount`). No
  missions → the no-missions line.
- **Filled needs-you badge** — `NeedsYouChip` now defaults to `.filled` (`warning` fill + `warningFg`
  text) instead of the outline capsule; the "99+" cap is unchanged (`StatusChip.swift`). `AgentRow`
  is its only caller; Mission Control uses the native `BadgeModel`, not this chip.
- **Pull-down search** (`AgentsView.swift`, `.searchable(placement: .navigationBarDrawer)`): a pure
  case/diacritic-insensitive name filter (`AgentSearch.filter`; blank query → all rows in order),
  a "No results" empty state (`EmptyStateView`), and an animated tier/recency reorder
  (`.smooth(Motion.common)` keyed on the visible-row ids, disabled under Reduce Motion). Copy:
  `Strings.AgentsSearch`. No pull-to-refresh.

Row derivations are pure and unit-tested (`HoustonTests/Agents/AgentRowTimeTests`,
`AgentSearchTests`, `AgentsOverviewBuilderTests`).

### iOS per-agent missions screen — a sober conversation list (founder directive 2026-07-06)
Tapping a home row pushes the agent's missions screen (`AgentMissions/AgentMissionsView.swift`),
rebuilt from a card grid into a WhatsApp-style conversation list. Native-only; the grouping/order and
`MissionCardData` are unchanged — this is layout.
- **No header** — the inline `navigationTitle` already names the agent and the home row already shows
  the helmet, so the old 40pt avatar + title block was removed. Body is just the grouped list.
- **Slim two-line rows** (`MissionRowContent.swift`, derived by the pure `MissionRowLine.swift`):
  line 1 = mission title + right-aligned relative time (`MissionTimestamp.relativeLabel`, hidden when
  unparseable); line 2 = a state signal that **collapses away when empty** — accent "Working…" (reuses
  `Strings.Chat.TitleBar.working`) while running, destructive `Strings.AgentMissions.snag`
  ("Hit a snag", title-less — the title is already on line 1) for error, else a muted description
  preview. Running dominates, then error, then description. **No** avatar / agent name / tags / card
  border / fill / glow; the `List` supplies inset hairline separators; rows keep a ~44pt tap target.
- **Grouping unchanged** — one `Section` per non-empty group in PARITY order (Needs you incl. error,
  Running, Done) with `BoardColumn.label` headers, plus a trailing Archived row. `needs_you`/`done`
  add no per-row chrome: the section header is the signal (sober = trust the structure).
- **Archived list** (`AgentArchivedMissionsView.swift`) reuses the SAME `MissionRowContent`, restyled
  to match (plain rows, inset separators) so the two screens read as one list.
- `MissionCardView` (the card) is now used ONLY by Mission Control's board (`MissionCardRow.swift`).
- Derivation is pure and unit-tested (`HoustonTests/AgentMissions/MissionRowLineTests`).

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

### Status reclassification — loading indicator vs streaming (`ui/chat/src/chat-status.ts:27-49`)
`deriveStatus`: only `assistant_text_streaming` counts as **streaming** (its visible growing text
IS the progress signal, so the loading indicator would just compete with it). `thinking_streaming`,
tool cycles, and silent gaps all resolve to **submitted** → the loading indicator STAYS VISIBLE
through reasoning + tool phases (HOU-655: treating `thinking_streaming` as streaming flickered the
indicator off during every thinking stretch).
- **iOS**: `ChatStatus.derive(feed:running:)` (pure mirror) + `ChatScreenModel.showLoadingLabel`.
  The `MissionStatusLine` renders while the turn is `running`; its "Mission in progress..." dot +
  shimmer label is suppressed while assistant text streams (`showLabel:false`), leaving only the
  **Stop** control (Stop stays available the entire running turn, matching desktop's composer stop).
  Pinned in `ChatStatusTests`.

### Queued messages while a turn runs (`ConversationVM.queued`, `vm-output.ts:35-58`)
Additive optional `queued?: QueuedMessageVM[]` (`{ id, text, attachmentNames? }`): messages typed
while a turn runs are HELD and flushed as ONE combined send at settle. **Queueing is SDK/engine-
adapter behavior, never the surface** (desktop: `packages/web/src/engine-adapter/send-queue.ts`) —
the surface only renders the published list (client-architecture.md invariant 1).
- **iOS**: `QueuedMessageVM` model + `ConversationVM.queued`; `QueuedMessagesView` renders each as a
  dimmed, pending, right-aligned bubble (clock glyph) above the composer. **Populate path deferred**:
  the SDK *bridge* path iOS uses has no send-queue (only the web engine-adapter drives `setQueued`),
  so `queued` is empty on iOS today — rendering is wired and forward-compatible for when a bridge-side
  queue lands. The removable affordance stays deferred until the bridge exposes a `removeQueued` seam.

### `failed_prompt` on the unauthenticated reconnect card (`ui/chat/src/types.ts:142-148`)
The `unauthenticated` provider error gained optional `failed_prompt` (JSON key `failed_prompt`) —
client-synthesized only (never on the wire; synthesized in `packages/sdk turn-settle.ts:92-104`):
the prompt whose SEND the engine refused because no provider was connected, so a "Send again"
affordance can resend THAT exact text.
- **iOS**: carried on `ProviderError.unauthenticated(..., failedPrompt:)`. The iOS provider-error card
  (`ProviderErrorCardView`) has **no action buttons** (v1 scope cut), so the "Send again" affordance
  **stays deferred** — the field is modeled + decoded now so the card can wire it later with no
  contract change.

### Shell / splash copy
Desktop shows a startup splash "Loading your workspace…" (`shell.json:278 starting`). **iOS has no
equivalent splash copy**: `RootView` branches only to the SDK-startup error view, the sign-in gate,
or the tabs — there is no loading-workspace screen, so nothing to align. (If a mobile startup splash
is added later, mirror this string.)

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
