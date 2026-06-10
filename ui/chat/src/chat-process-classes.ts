/**
 * Pure class-name constants for the chat "process" block (reasoning + tool
 * calls). Kept dependency-free (no React, no CSS imports) so the layout
 * decisions can be asserted in a `node:test` unit test the same way
 * `sidebar-classes.ts` is — see `tests/chat-process-pane.test.ts`.
 */

/**
 * The scroll pane that wraps an *open* process block's content.
 *
 * Why a cap: while the agent is working its tool calls stream into one open
 * accordion. Without a height cap that list grows unbounded and pushes the
 * whole conversation off-screen (HOU-426 — "the tool calls take all the
 * chat"). `max-h-80` bounds it and `overflow-y-auto` scrolls the overflow in
 * place. Scroll-chaining is left on (no `overscroll-contain`): this is inline,
 * in-flow content, so a wheel that reaches the pane's edge should keep
 * scrolling the conversation rather than dead-end. `pr-1` keeps content clear
 * of the scrollbar gutter (matters on Windows, where the bar takes space).
 *
 * Stick-to-bottom (the active tool stays in view) is wired separately via
 * `useStickToBottom` in `chat-process-block.tsx`.
 */
export const processScrollPaneClass = "max-h-80 overflow-y-auto pr-1";
