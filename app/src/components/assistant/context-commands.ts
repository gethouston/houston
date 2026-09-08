/**
 * The conversation commands the composer offers as menu entries.
 *
 * `text` is sent through the ORDINARY send path: the runtime recognizes it at
 * the turn route and answers it itself (`packages/runtime/src/session/
 * conversation-command.ts`), which is the same thing that happens when the user
 * types the words. So the menu is a shortcut, never a second implementation,
 * and every channel that can send text has the feature already.
 *
 * These literals are a CONTRACT with that parser: a typo here does not fail
 * loudly, it quietly sends the agent a prompt about compacting. The test beside
 * this file pins them.
 */
export interface ContextCommandItem {
  id: "compact" | "clear";
  /** The exact message the runtime parses as this command. */
  text: string;
  /** Key in the `chat` i18n namespace for the menu label. */
  labelKey: `contextCommands.${"compact" | "clear"}`;
}

export const CONTEXT_COMMANDS: readonly ContextCommandItem[] = [
  { id: "compact", text: "/compact", labelKey: "contextCommands.compact" },
  { id: "clear", text: "/clear", labelKey: "contextCommands.clear" },
];
