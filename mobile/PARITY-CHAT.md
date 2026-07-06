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
**muted-foreground**, Tailwind **`animate-pulse`** = opacity 1→.5→1 over **2s cubic-bezier(.4,0,.6,1) infinite**, NO translation.
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
- Surface: `bg-card` glass, `border-border/50` 1px, **rounded-[28px]**, `p-2.5` (10),
  rest shadow `0 1px 6px rgba(0,0,0,.06)`, focus-within deepens shadow only (no ring).
- Textarea: `text-base`(16) `leading-[1.2]`, placeholder `muted-foreground/50`. Auto-grows to
  **max 208px** then scrolls; height animates 100ms ease-out. Enter sends, Shift+Enter newline.
  NOT disabled while a turn runs. Placeholder copy: new "What should the agent work on?",
  follow-up "Send a follow-up..." (desktop literals, ai-board.tsx:700-703).
- Send button: `ArrowUpIcon` size-4 in a **36px circle** (`size-9 rounded-full`) `bg-primary
  text-primary-foreground`; disabled = opacity-30 when ready && no content. Same spot always.
- Stop (while running): the SAME 36px `bg-primary` circle morphs to a solid `SquareIcon`
  size-3.5 fill, aria "Stop", calls onStop. No confirm. (Escape also stops on desktop.)
- OMIT for v1: the leading + attach button, the Dictate mic, and the whole footer row
  (Skills pill / model selector / effort selector / context gauge). Deferred.

## 3. Messages — desktop: ui/chat/src/ai-elements/message.tsx
- User bubble: right, `ml-auto max-w-[70%]`, `rounded-[22px] bg-muted px-4 py-2.5
  text-foreground text-base leading-6`. **NO tail, no avatar, no timestamp.**
  (iOS today: near-black primary bubble + WhatsApp tail — recolor to muted, drop the tail, r=22.)
- Assistant: **full-width, NO bubble/background/border/tail/avatar**, `text-foreground
  text-base leading-6`. (iOS today: card bubble — remove the bubble entirely.)
- Markdown: desktop renders full markdown. iOS: build a native SwiftUI markdown view using
  `AttributedString(markdown:options:.init(interpretedSyntax:.full))` and render by walking
  `presentationIntent` blocks — paragraphs, headings, ordered/unordered lists, blockquotes,
  fenced code blocks (monospace slab, NO syntax highlighting v1), inline bold/italic/code/links.
  No third-party packages. Math/mermaid deferred (render fenced/raw). Streaming text updates in
  place (stable row id). Assistant prose is the common case for the non-technical target user.
- No timestamps anywhere.

## 4. Feed catalog dispositions (desktop: ui/chat/src/feed-to-messages.ts)
- assistant_text/_streaming → full-width markdown assistant message.
- thinking/_streaming + tool_call/tool_result → folded into ONE collapsible process block (§5).
  Copy: "Thinking..." (shimmer) / "Thought for {n} seconds" / "Thought for a few seconds".
- provider_error → the typed ProviderErrorCard (keep iOS's; kind "cancelled" renders nothing).
- system_message → centered `text-xs muted-foreground/60 italic`.
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
(present-tense tool verb), settled/collapsed "Mission log". `muted-foreground/65`, text-xs.
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
