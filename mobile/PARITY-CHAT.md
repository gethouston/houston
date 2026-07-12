# iOS Chat — faithful desktop-parity rebuild contract

> Extracted from the desktop chat (ui/chat, app/src) 2026-07-06. The founder's ask:
> "a chat that looks EXACTLY like the one we have — same input, same helmet loading."
> This pins the decisions + must-match values; read the cited desktop source for pixel detail.
> Tokens come ONLY from DesignSystem (design-tokens); no raw hex/spacing in Features/Chat.

## Scope decision (v1 "quick access")
IN, faithful: the helmet loader, the composer look (input card + send/stop), user+assistant
message rendering incl. markdown, the collapsible process block (reasoning+tools) with the
helmet header, final_result rendered as NOTHING, no move-to-done anywhere.
DEFERRED (note in code, don't build now): composer footer (model/effort/skills selectors),
attachments (+ button), syntax-highlighted code blocks / math / mermaid, the dark-Bash-slab &
red/green-diff tool-result treatments, rich file-changes summary. Keep clean minimal versions.

## 1. Helmet loading indicator (THE signature state — get this exact)
Desktop: `app/src/components/use-chat-display-labels.tsx:53-58` — the Houston helmet glyph
(`HoustonLogo`, `app/src/components/shell/agent-avatar.tsx:117-147`; same path as
`HoustonHelmet` in ui/core/src/components/houston-avatar.tsx) at **size 20**, color
**ink-muted**, Tailwind **`animate-pulse`** = opacity 1→.5→1 over **2s cubic-bezier(.4,0,.6,1) infinite**, NO translation.
Placement (`ui/chat/src/chat-messages.tsx:219-229`): while a turn is in flight and NOT yet
streaming text, the pending assistant slot shows a left-aligned column: the shimmer status
label ("Mission in progress...") stacked ABOVE the pulsing helmet. Helmet stays up through
thinking/tool phases; disappears the instant assistant text streams (status `submitted` →
`streaming`, `ui/chat/src/chat-status.ts`). iOS today wrongly shows a blue dot + shimmer +
a status-line Stop — replace with the pulsing helmet; move Stop into the composer.
The helmet is also the process-block header glyph at size 13 (see §5).

## 2. Composer (input)  — desktop: ui/chat/src/chat-input.tsx + ai-elements/prompt-input.tsx
- NOT fixed; it is the last shrink-0 block under the scrolling feed. `max-w-3xl` (768) centered.
  iOS adds keyboard-avoidance + safe-area itself.
- Surface: `bg-card` glass, `border-line/50` 1px, **rounded-[28px]**, `p-2.5` (10),
  rest shadow `0 1px 6px rgba(0,0,0,.06)`, focus-within deepens shadow only (no ring).
- Textarea: `text-base`(16) `leading-[1.2]`, placeholder `ink-muted/50`. Auto-grows to
  **max 208px** then scrolls; height animates 100ms ease-out. Enter sends, Shift+Enter newline.
  NOT disabled while a turn runs. Placeholder copy: new "What should the agent work on?",
  follow-up "Send a follow-up..." (desktop literals, ai-board.tsx:700-703).
- Send button: `ArrowUpIcon` size-4 in a **36px circle** (`size-9 rounded-full`) `bg-action
  text-action-text`; disabled = opacity-30 when ready && no content. Same spot always.
- Stop (while running): the SAME 36px `bg-action` circle morphs to a solid `SquareIcon`
  size-3.5 fill, aria "Stop", calls onStop. No confirm. (Escape also stops on desktop.)
- OMIT for v1: the leading + attach button, the Dictate mic, and the whole footer row
  (Skills pill / model selector / effort selector / context gauge). Deferred.
  **iOS PARTIALLY SUPERSEDED (§10):** the leading "+" now opens a menu carrying Attach file /
  Attach photo (staged chips) and an Effort sheet; the model picker also lives there (§10). The
  Dictate mic, Skills pill, and context gauge stay deferred.

## 3. Messages — desktop: ui/chat/src/ai-elements/message.tsx
- User bubble: right, `ml-auto max-w-[70%]`, `rounded-[22px] bg-chip-subtle px-4 py-2.5
  text-ink text-base leading-6`. **NO tail, no avatar.**
  (iOS today: near-black primary bubble + WhatsApp tail — recolor to muted, drop the tail, r=22.)
  **iOS SUPERSEDED (§8): the user bubble now carries an in-bubble bottom-right timestamp.**
- Assistant: **full-width, NO bubble/background/border/tail/avatar**, `text-ink
  text-base leading-6`. (iOS today: card bubble — remove the bubble entirely.)
- Markdown: desktop renders full markdown. iOS: build a native SwiftUI markdown view using
  `AttributedString(markdown:options:.init(interpretedSyntax:.full))` and render by walking
  `presentationIntent` blocks — paragraphs, headings, ordered/unordered lists, blockquotes,
  fenced code blocks (monospace slab, NO syntax highlighting v1), inline bold/italic/code/links.
  No third-party packages. Math/mermaid deferred (render fenced/raw). Streaming text updates in
  place (stable row id). Assistant prose is the common case for the non-technical target user.
- ~~No timestamps anywhere.~~ **SUPERSEDED by a founder directive (2026-07-06) — see §8.**
  The mobile thread adopts WhatsApp/Telegram anatomy: in-bubble user timestamps, day
  separators, a floating date pill, and 60s grouping. Desktop is unchanged.

## 4. Feed catalog dispositions (desktop: ui/chat/src/feed-to-messages.ts)
- assistant_text/_streaming → full-width markdown assistant message.
- thinking/_streaming + tool_call/tool_result → folded into ONE collapsible process block (§5).
  Copy: "Thinking..." (shimmer) / "Thought for {n} seconds" / "Thought for a few seconds".
- provider_error → the typed ProviderErrorCard (keep iOS's; kind "cancelled" renders nothing).
- system_message → centered `text-xs ink-muted/60 italic`.
- context_compacted → centered divider, "Earlier conversation summarized so the chat can keep going".
- provider_switched → same divider, "Continued with {{provider}}"[", summarized to fit"].
- file_changes → simple per-turn summary (keep iOS's minimal version; rich TurnFileSummary deferred).
- **final_result → RENDER NOTHING.** Desktop `feed-to-messages.ts:359-361` is flush-only; the
  reply is the assistant_text bubble only. `result`/`cost_usd`/`duration_ms` are never shown.
  DELETE iOS MissionLogBlock and the `.missionLog` fold case — it currently DUPLICATES the reply.

## 5. Process block + status line — desktop: chat-process-block.tsx, chat-process-header.ts
Reasoning + tools collapse into one block, **collapsed by default** (auto-opens reasoning while
streaming, closes ~1s after). Header = `ChatStatusLine` = HoustonHelmet size 13 + shimmer label:
active pre-tool "Mission in progress...", active with a tool "Mission in progress: {action}"
(present-tense tool verb), settled/collapsed "Mission log". `ink-muted/65`, text-xs.
Renders INLINE in the stream (no above-composer bar). "Mission log" is ONLY this settled header
label — never a block that repeats the reply.
Per-tool rows inside: lucide-equivalent icon by tool (Bash/Read/Edit/Write/Grep/Wrench) + tense
label + " — {detail}"; result preview collapsible. v1: a clean monospace preview is fine; the
dark-Bash-slab and red/green Edit diff are deferred.

## 6. Remove "move to done" everywhere (keep the setStatus mutation; remove only affordances)
iOS chat: delete `Features/Chat/ApproveBar.swift`; remove ChatView.swift:61-62,71 +
ChatScreenModel showApproveBar/approve() + Strings+Chat moveToDone.
iOS lists: remove the approve context-menu/swipe + `canApprove`/`onApprove` plumbing in
MissionControl/MissionCardRow.swift, AgentMissions/AgentMissionRow.swift, MissionControlView.swift,
MissionControlPager.swift, AgentMissionsView.swift, AgentMissionsSectionList.swift,
ArchivedMissionsView.swift, and DesignSystem/Strings.swift approve. Keep MissionActions.setStatus/
archive + ChatCommands.setStatus + status enums (used by other paths).

## 7. Settings simplification ("quick access")
Settings tab = ONLY: Account (identity + sign in / sign out) and Appearance (light/dark). Remove
workspace name, language, contexts, report bug, danger zone, version rows. Hide the AI Models and
Integrations entry points (Settings nav rows + the agent-screen overflow-menu items) — KEEP the
Feature code (tested; reversible), just make it unreachable. Note the removals in code.

## 8. Mobile thread = WhatsApp/Telegram anatomy (founder directive, 2026-07-06)
SUPERSEDES the §3/§5 "no timestamps anywhere" decision **for mobile only**. Desktop is
untouched — this is a native-thread affordance layered on top of the parity feed, not a
cross-surface change. It rides ONE additive, client-only SDK field: an optional epoch-ms
`ts` on each feed VM entry (seeded from `ChatMessage.ts`, live-stamped when absent,
preserved across streaming/finalization; `packages/protocol` and the wire are unchanged).
See `packages/sdk/BRIDGE.md` §7. `ts` is OPTIONAL: older data has none, so every consumer
degrades gracefully (a flat, separator-less feed; no crash).

- **In-bubble user timestamp** — bottom-right inside the user bubble (WhatsApp convention),
  `Typography.caption`, `primaryFg` @ opacity `0.6` (`ChatMetrics.bubbleTimeOpacity`),
  `Date.FormatStyle(time: .shortened)` (locale clock: 3:45 PM / 15:45), rendered in the
  device's local time zone. A custom `TimedBubbleLayout` (`Layout`) places it inline on the
  last line, or drops it to its own bottom-right line when the block is full — never overlaps.
  Files: `ChatBubbles.swift` (UserBubble), `TimedBubbleLayout.swift`, `ChatBubbleTime.swift`.
  Assistant prose gets NO in-line time and NO Copy menu (text selection is kept instead — on
  iOS 17 `.contextMenu` and `.textSelection` conflict). Only the user bubble times/menus.
- **Day-separator pills** — a centered pill between days (Today / Yesterday / weekday within
  the last 6 days / medium date), inserted only between dated rows by the pure
  `ChatTimeline.rows(from:timestamps:)` fold. Labels: `TimelineDayLabel`. Strings:
  `Strings.Chat.Timeline.today` / `.yesterday`.
- **Floating date pill** — a top-center pill naming the day at the viewport top, shown while
  scrolling history, hidden ~1s after scrolling settles and immediately at the bottom.
  Driven by `FloatingDatePillModel` + `TimelineDayTracker` off scroll-space day anchors
  (`DayAnchor`/`DayAnchorsKey`). Honors Reduce Motion. Files: `ChatTimelineScroll.swift`,
  `ChatTimelineViews.swift`.
- **60s user-message grouping** — consecutive user messages within 60s and the same day render
  tight (`Spacing.space2` top pad) with no separator between them; other rows use
  `Spacing.space10`. Grouping is part of the `ChatTimeline` fold.
- **Unread badge** — the jump-to-bottom button gains a count badge (`UnreadBadge`) of unread
  MESSAGES that arrived while scrolled away — a folded process block (reasoning + tools) is not a
  message, so a turn increments by one, matching WhatsApp (`ChatRow.countsAsUnreadMessage`). The
  count is capped at "99+" (`Strings.cappedCount`); the first observation only seeds the baseline;
  returning to the bottom clears it. State: `UnreadCounter` (`ChatTimelineScroll.swift`).
- **Title bar (principal)** — a WhatsApp-style bar: agent avatar (`HoustonAvatar`, 26pt) + the
  agent name (line 1, `bodyMedium`) + a status line (line 2, `caption`): "Working…" (shimmer,
  `mutedFg`) while running, "Needs your attention" (`warning`) when settled needs-you, else
  hidden. Derivation: `ChatTitleStatus.derive(running:boardStatus:)`. Files: `ChatTitleView.swift`,
  `ChatTitleStatus.swift`, `Strings.Chat.TitleBar`. The name is threaded via
  `ChatView(agentId:conversationId:title:agentName:)` (optional; Mission Control opens a chat by
  mission, so it falls back to the mission title).
- **Draft composer auto-focus** — a draft chat (`conversationId == nil`) auto-focuses the composer
  once on appear (deferred past the push transition); existing missions never do.
  Files: `ChatView.swift` (`isDraft`), `MissionComposer.swift` (`autoFocus`).

### Messenger naturalness (waves 2+3, founder directive 2026-07-06)

Layered on the §8 timeline; still client-only. Rides a SECOND additive SDK field: an optional
`pending` boolean on the feed VM entry (BRIDGE.md §7, beside `ts`). `pending` never crosses the
wire — the built-in conversation VM stamps it `true` on the ONE optimistic user-message push and
clears it (same id, plain reactive snapshot) on the first server evidence for that turn (any later
pushed feed item, OR a `sessionStatus` transition to `completed`/`error`). History frames are never
pending. Optional: absent → confirmed, so every consumer degrades to a plain check.

- **Delivery ticks (clock → check)** — the in-bubble user timestamp gains a trailing tick glyph:
  `clock` (SF Symbol) while `pending`, `checkmark` once confirmed — WhatsApp's sending/sent cue.
  Same `Typography.caption` + `primaryFg` @ `0.6` as the time, `.imageScale(.small)`, morphing via
  `.contentTransition(.symbolEffect(.replace))` + `.animation(.snappy(Motion.fast), value: pending)`.
  The tick renders only inside the time cluster (no `ts` → no tick). Pure selector:
  `ChatBubbleTick.symbolName(pending:)`. VoiceOver: `Strings.Chat.deliveryPending` / `.deliverySent`.
  Seam: `FeedItemVM.pending` → `ChatScreenModel.pendingIds` (feed-entry ids where `pending == true`)
  → `MissionFeed.pendingIds` → `ChatTimeline.rows(…, pendingIds:)` → `TimelineItem.pending` →
  `FeedRow.pending` → `UserBubble.pending`. Files: `ChatBubbleTime.swift`, `ChatBubbles.swift`.
- **Send/receive insertion motion** — newly appended rows slide up + fade in (`FeedMotion`,
  `.snappy(Motion.fast)`); the initial history load and content arriving while the user reads
  history do NOT animate. Gated by `FeedMotion.animatesAppend(hasLoadedOnce:atBottom:)` — true only
  after the first non-empty snapshot has rendered AND the feed is pinned to the bottom. The append
  animation is keyed on the row-id set (`timeline.map(\.id)`), so a streaming text delta (same ids)
  never re-transitions; only a genuine insertion does. Reduce Motion → opacity-only transition.
  Files: `MissionFeed.swift` (`hasLoadedOnce`), `FeedMotion.swift`.
- **Branded wallpaper** — a faint tiled Houston-helmet doodle behind the whole thread (WhatsApp's
  patterned backdrop). A static `Canvas` stamps one `HelmetShape` path (`glyphSize` 28) on a
  deterministic diagonal grid (`columnSpacing` 72, `rowSpacing` 60, one bleed row/col past each
  edge), drawn in `theme.foreground` @ `patternOpacity` 0.035 over a `theme.background` base — so it
  adapts light/dark from the token pair with no per-theme branching. No `TimelineView`/animation
  (the closure re-runs only on size/theme change). Applied `.background { ChatWallpaperView() }`
  AFTER the composer `safeAreaInset` so it bleeds under the composer material and supplies the base
  fill the old flat `.background(theme.background)` used to. Gated OFF under Reduce Transparency
  (`ChatWallpaperVisibility.showsPattern`), then only the flat background renders. `.accessibilityHidden`.
  The four geometry/opacity values are documented feature constants (`ChatMetrics`/`RunningGlow`
  precedent), not raw literals. Files: `ChatWallpaperLayout.swift`, `ChatWallpaperView.swift`,
  `ChatView.swift`.

Wave-2/3 logic is pure and unit-tested (`HoustonTests/Chat/ChatWallpaperTests`, `FeedMotionTests`,
plus tick/`pendingIds` cases in `ChatBubbleTimeTests` / `ChatTimelineTests`).

Timeline logic is pure and unit-tested (`HoustonTests/Chat/ChatTimelineTests`,
`ChatBubbleTimeTests`, `ChatTitleStatusTests`). All layout values come from DesignSystem
tokens (Spacing / Typography / Radius / Theme roles); no raw hex or spacing literals.

## 9. Interaction card (in-chat gather-what-I-need) — desktop: ui/chat/interaction-card.tsx

Rides the additive SDK field `ConversationVM.pendingInteraction` (PARITY §1, BRIDGE.md §7): the
ordered steps a settled turn on `needs_you` is waiting on the user for. Set when a turn settles on
an `ask_user` / `request_connection` / `plan_ready`; cleared (→ `nil` + `running`) the instant the
next turn starts. Steps: up to 3 questions first, then ≤1 sign-in, then connects, then plan_ready
(`packages/protocol/src/domain/interaction.ts`).

- **Read seam:** `ChatScreenModel.pendingInteraction` (derived) returns the interaction only when
  `!running` AND it has renderable steps — mirrors desktop `deriveActiveInteraction`; a running turn
  always reads `nil`, so a new turn tears the card down through that same reactivity (no separate
  teardown). Files: `ConversationVM.swift`, `ChatScreenModel+Derived.swift`, `InteractionModel.swift`.
- **Mount:** `InteractionCard(interaction:isSending:onAnswer:onOpenAIModels:onOpenIntegrations:)`
  sits ABOVE the live composer (mobile divergence — desktop REPLACES the composer). Appears/removes
  through `FeedMotion.rowTransition`, animated by the parent. Files: `ChatView.swift`,
  `InteractionCard.swift`.
- **Stepper:** walks renderable steps one at a time with a quiet "x of n" caption for multi-step
  sequences (`InteractionStepper` cursor held in card `@State`, re-seeded per interaction because the
  VM clears on turn start). Files: `InteractionStepper.swift`.
- **Answer = a normal turn** (there is NO dedicated answer command — interaction contract):
  - A question pick sends `"<question>: <label>"` (`InteractionReply.line`, ported from desktop
    `composeInteractionReply` single-question form). A question answer is TERMINAL (protocol orders
    questions first, so a question-bearing sequence settles on that one send).
  - Free-text is a RAW composer send (mobile divergence — no in-card textarea; the live composer below
    IS the free-text answer).
  - Sign-in step → `onOpenAIModels` (AI Models sheet); connect step → `onOpenIntegrations`
    (Integrations sheet); both then "Continue" (`stepper.advance()`) for pure signin→connect walks.
  - `plan_ready` surfaces the summary + a single primary approve sending `"Go ahead with the plan."`
    (desktop `planReady.startWorkingMessage`). Autopilot / Keep-planning have no mobile seam yet.
  Files: `InteractionQuestionView.swift`, `InteractionActionSteps.swift`, `Strings+Interaction.swift`.
- Pure logic unit-tested (`HoustonTests/Chat/InteractionModelTests`, `InteractionStepperTests`).

## 10. The "+" menu — attach, photo, effort, model (founder directive)

The leading "+" is a native anchored `Menu` (founder directive 2026-07-09: the same visual family
as the long-press message menu, popping up AT the button — never a detached
dialog). `MissionComposer` owns the anchor and takes the items as a `plusMenu` ViewBuilder;
`ChatView` supplies the four `Label` items, and the importers/sheets they open live in
`AttachmentComposerControls.swift`.

- **Attach file / Attach photo** — a document picker and a `PhotosPicker`; picked items are read to
  bytes off the view (`AttachmentIngest.swift`, security-scoped file read + async photo transfer,
  failures RETURNED not swallowed) and staged as removable chips above the input
  (`StagedAttachmentChips`, `AttachmentChips.swift`). **20 MB per-file cap**
  (`AttachmentStaging.adding/removing`, pure reducer); an oversize add surfaces a distinct
  "File too large" alert (`ChatScreenModel.attachmentError`), never the generic action alert.
- **Send with attachments** (`AttachmentSend.swift`): on send, staged files upload via the
  `turns/attachments/save` bridge command (`scopeId` = the conversation's session key, base64 bytes,
  BRIDGE.md §6.7) → the saved paths are woven into the message by `AttachmentMessage.encode`
  (byte-identical to the SDK's `buildAttachmentText` / the desktop encoder). Attachments-only (no
  text) sends. An upload failure keeps the files staged (nothing silently lost) and surfaces the
  reason. The send button shows a spinner and disables while the upload is in flight.
- **Attachment chips in the user bubble** — a sent message WITH attachments decodes
  (`AttachmentMessage.decode`) to the clean typed text + file-name chips (`BubbleAttachmentChips`);
  the raw model-facing path block never leaks into history. Files: `ChatBubbles.swift`.
- **Effort sheet** (`EffortSheet.swift`) — a per-conversation reasoning-effort pin
  (`ChatScreenModel.selectedEffort`) threaded on every `turns/send` as `TurnSendInput.effort`
  (`turn-inputs.ts`). Resolution/levels are pure (`EffortResolution.swift`, `ModelCatalog` effort
  table). **FLAG:** iOS pins effort per-CONVERSATION, mirroring the HOU-695 model pin; desktop
  persists effort per-AGENT via `providers/setModel`. Deliberate; a founder ruling is pending.
- **Model picker** — the HOU-695 per-conversation model pin (`ChatScreenModel.selectedModel`),
  passed as `TurnSendInput.model`; never the agent-wide default.
- Pure logic unit-tested (`HoustonTests/Chat/AttachmentMessageTests`, `AttachmentStagingTests`,
  `EffortResolutionTests`, plus effort/attachment threading in `ChatScreenModelTests`).
