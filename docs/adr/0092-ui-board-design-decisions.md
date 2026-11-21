# ui/board: design decisions

Covers `ui/board/` (`@houston-ai/board`): the AI board, its panel state, kanban cards, drag and archived list.

## History hydration

AIBoard holds no feed data: persisted history is loaded once per session key on selection and handed to the parent through `onHistoryLoaded`, so history and live socket events live in one store. An empty load is not proof the chat is empty (the loader resolves `[]` while the engine warms or before the server restores the conversation), so the session is un-marked and the next selection retries; a failed load also un-marks, and reporting is the parent loader's job. Lives in `ui/board/src/ai-board.tsx`.

## Panel visibility follows the selection

Panel visibility keys off the selection, never off the selected card's presence in `items`: a just-created or selected mission can be transiently absent (an engine cold start holds the list read, and refetches racing the wake can resolve before the row lands), and an item-presence check unmounted and remounted an open chat. Only an explicit deselect (close, Escape, delete, agent switch) closes the panel. While the card is absent, the header falls back to the same selection's last resolved card (a render-time, idempotent write); a selection that never resolved renders with no card and a blank title, never the new-conversation label. The feed and session key are also keyed off `selectedId`, so the optimistic first message renders immediately. Lives in `ui/board/src/panel-state.ts` and `ui/board/src/ai-board.tsx`.

## Composer focus and phone keyboard

When a selection appears, the composer focus token is bumped so keyboard users can type at once, but never on the phone, where a programmatic focus raises the keyboard over the chat the user opened to read. `suppressSelectionFocus` skips it for side-companion panels (the routine editor's chat), where the late bump stole focus mid-typing from the form. Lives in `ui/board/src/ai-board.tsx`.

## Send routing and duplicate submits

A repeated submit (Enter auto-repeat, double click) that arrives while the first send is still creating its conversation has no session key yet, so it would mint a second mission and run the prompt twice; the submit gate drops it. Sends into an existing session are never dropped, since the send queue serializes them. Routing keys off `activeSessionKey`, not the selected item, so a send during the window where the created activity is absent from `items` goes to the existing session. A submit interceptor can send itself, decline, or rewrite the text (with `onUnsent` restoring outside context when the send fails); a throw propagates so the composer keeps the draft. Lives in `ui/board/src/submit-gate.ts`, `ui/board/src/composer-send.ts`, `ui/board/src/ai-board.tsx`.

## Board host modes and lifecycle

The panel renders into an app container via portal when `panelContainer` is given, otherwise into an inline SplitView; `chatOnly` renders only the panel, where an unselected panel is the new-conversation composer so the create path stays reachable. On unmount the board tells the parent the panel closed, or app-level portal containers stay visible and empty. `closePanel` is exposed because the empty new-mission panel has no `selectedId` for the parent to clear. Composer drafts live in a keyed store so a keystroke re-renders only the composer; the "new-conversation" key is the new-mission panel's. The chat's overflow menu lives in the panel header while the search popover stays inside ChatMessages; they talk through `findToken` and `conversationTriggerRef`. Lives in `ui/board/src/ai-board.tsx`.

## Composer wording

"Follow-up" wording applies to a conversation that already had a turn. Most boards treat an open conversation as having history (the clicked card is history even while its feed loads); a permanent conversation (the assistant) opts in to reading the feed so an empty chat asks its opening question, matching the empty state. Lives in `ui/board/src/board-labels.ts`.

## Pointer-based drag

The board runs its own pointer-events drag instead of native HTML5 drag and drop, so the cursor is the same on every OS (set by `body` classes in `globals.css`). Handlers are delegated on the container; cards and columns carry literal `data-kanban-card`, `data-kanban-draggable` and `data-kanban-column` attributes, because TypeScript only allows hyphenated `data-*` names as literal JSX attributes; the names are mirrored as constants in `board-drag-dom.ts` for queries. A press becomes a drag past a pixel threshold; interactive controls inside a card never start one; the click following a drag is swallowed so it does not also select the card; Escape aborts. A click-through clone of the card follows the cursor (native drag drew this image for free), appended to `<body>` so it inherits theme variables from `<html>`; click-through lets `elementFromPoint` hit-test the column below. Drags are suppressed while renaming or while a multi-select is active (the bulk bar owns moves then). A column's drop role is idle, origin (a no-op, grab cursor kept), drop-target, or forbidden (`not-allowed` cursor); by default only a move to a different section counts, and consumers override via `canDropItem`. Lives in `ui/board/src/use-board-drag.ts`, `ui/board/src/board-drag-dom.ts`, `ui/board/src/dnd.ts`, `ui/board/src/kanban-board.tsx`.

## Kanban card

Enter and Space open only when the card itself is the target; inner controls (rename input, checkbox) keep their keys.

For running and active cards, the running glow's inner fill is set to a solid `color-mix` of the translucent accent over the card background, so the conic gradient does not bleed through. Transitions are restricted to safe properties, because `transition-all` would animate the glow's gradient layer against its keyframes. Running cards get no Tailwind `border`, which would override the glow's border-style; others keep a constant 1px border so state changes never shift layout.

The multi-select ring sits on top of the border, half strength, drawn inside the border because the column's scrollbar gutter clips an outer ring. The checkbox replaces the leading icon in place so revealing it never shifts the row, stays keyboard reachable, and stays visible while any selection exists.

The cursor is a plain pointer, never a grab hand; during a drag the global cursor overrides.

The people stack floats over the body's bottom-right corner inside the card padding (12px from the edge, its 2px ring bleeding into the padding) and the body reserves a right gutter sized to the stack, rounded up to the spacing scale: N 18px circles overlapped by 6px with 2px rings paint `N * 12 + 10` px. Unattributed cards get no gutter, so a single-player board is unchanged.

At most one status-gated action shows: approve on Needs you, archive on Done, never on running; the gate requires a wired handler, no custom `actions` node, and a matching status.

Lives in `ui/board/src/kanban-card.tsx`, `ui/board/src/kanban-card-actions.ts`, `ui/board/src/kanban-people-logic.ts`.

## Card action row

All action buttons are 24px boxes (the hit-target floor) with 16px glyphs at one light `ink-muted/40` resting tint, because mixed weights in one cluster read as a rendering bug; color appears on hover only for semantic outcomes (approve green, delete red). Rename and delete fold into an always-visible "more" button below the `card-actions` container width, since three 24px targets in a 180px column leave too little room for the time. Keys that press a button or open the menu belong to the control; other arrows still move the board highlight. The menu is non-modal, because a modal menu closing under the delete dialog leaves the page inert; portalled clicks are stopped from bubbling to the card; the confirm dialog returns focus to the menu trigger. Lives in `ui/board/src/kanban-card-action-row.tsx` and `ui/board/src/kanban-card-actions.ts`.

## Columns and lists

Cards and list rows mount with no enter or exit animation, because switching agents swaps the whole set and a fade cross-blended two agents' cards; `layout` stays for moves between columns. The column scrollbar takes 6px of layout width in place of right padding, so cards keep the same width whether or not the column scrolls: `overflow-y-scroll` for WebKit, which reports `scrollbar-gutter` support but reserves nothing for a styled scrollbar, and the gutter for Chromium; Firefox ignores the styled scrollbar and keeps the padding. Columns are desktop-only; phones show a grouped task list. The "+" bar uses the resting card surface so it reads as the column's next slot. The bulk action bar confirms every action, and a locked selection shows its single move target directly. Lives in `ui/board/src/kanban-column.tsx`, `ui/board/src/kanban-column-parts.tsx`, `ui/board/src/kanban-list.tsx`, `ui/board/src/bulk-action-bar.tsx`.

## Detail panel header

The header is capped at the message column's reading width and centered, so a full-width panel does not strand it at the left. It wears `bg-pane`, the same token as the chat, so there is no seam. The leading Back control sits at the panel's own edge and leaves the flow once the header has room for the cap plus the widest localized Back, so the row centers on the full width. The people stack sits left with the identity block (it is about the task) and is a button opening the roster, because a hover tooltip is dead on touch; it is hidden when only the viewer is on the task. Phone hit slops are 8px except 4px toward the menu, whose own 8px slop meets it across the 12px gap. Lives in `ui/board/src/kanban-detail-panel.tsx` and `ui/board/src/kanban-people-logic.ts`.

## Face stacks

Each face's 2px ring is painted in the surface color so overlaps read as cutouts; rings are set at the group level because AvatarGroup's `*:data-[slot=avatar]:ring-*` outranks avatar classes, and the classes are whole literals for Tailwind's scanner. On the glass `background` surface in dark mode the ring uses the solid composited tone, since a translucent ring lets neighbors bleed through. `TooltipTrigger asChild` injects `data-slot="tooltip-trigger"` and Avatar spreads props after its own `data-slot`, which overwrote the marker and removed every ring; the face re-asserts `data-slot` as a child prop. The initials fallback is opaque (a person tone), since `bg-chip-subtle` is nearly transparent. The "+N" chip is a solid fill, its popover toggle stops propagation so the card is not selected, and hover dims by opacity because a solid token's darker step differs per theme. Initials slice by code point so astral characters are not cut mid surrogate pair. Lives in `ui/board/src/kanban-people-face.tsx`, `ui/board/src/kanban-people.tsx`, `ui/board/src/kanban-people-logic.ts`.

## Person tones

A person's tone is a hash of their stable id (FNV-1a with `Math.imul`), not a render index, so the same teammate keeps one color on every card and surface; character sums collided on near-identical ids. Five desaturated tones keep faces from competing with agent helmets. Name text uses a parallel array in the same order, retuned to clear 4.5:1 on the chat bubble (the fills measured 2.90 to 3.14 in dark). Lives in `ui/board/src/kanban-people-tone.ts`.

## Message time labels

Cached `Intl` formatters fix their time zone at construction, so they are built in UTC and given the local wall-clock time; cached local formatters kept printing the old zone after a time-zone change. Yesterday is computed from local calendar dates so it is stable across DST. Card labels from another year step down through shorter forms (pt "31 de ago. de 2025" is 104px in a 66px slot), measured with the browser's own truncation: the text's own width rather than `scrollWidth`/`clientWidth`, which round and miss fractional clipping, re-measured synchronously on width change. Lives in `ui/board/src/message-time.ts` and `ui/board/src/fit-label.ts`.

## Phone task rows

A task row is one button with a status glyph, title, optional preview and trailing slot, shared by every phone task list. The glyph is the only state affordance (lists already group by section); running is the only moving glyph; waiting-on-user is amber, not red. The hairline drops on the last row. Group headings are quieter than rows; the archive group opens closed; a count's accessible name replaces the bare number when supplied. Lives in `ui/board/src/task-row.tsx`, `ui/board/src/task-row-styles.ts`, `ui/board/src/task-list-group.tsx`.

## Archived list

Archived rows show icon, agent name, title, the card's tag pill (capped so the title keeps room) and delete; a body-only search match shows a highlighted fragment under the title. The wide left-aligned rail lets the chat open beside the list while missions stay visible. Tags truncate inside their pill. `MessageMention` is re-exported so consumers need not reach into `@houston-ai/chat`. Lives in `ui/board/src/kanban-list-item.tsx`, `ui/board/src/kanban-list-layout.ts`, `ui/board/src/kanban-tag.tsx`, `ui/board/src/index.ts`.
