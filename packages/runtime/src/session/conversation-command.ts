export type ConversationCommand = "clear" | "compact";

const COMMANDS: Readonly<Record<string, ConversationCommand>> = {
  "/clear": "clear",
  "/compact": "compact",
  "/compress": "compact",
};

export function parseConversationCommand(
  text: string,
): ConversationCommand | null {
  return COMMANDS[text.trim().toLowerCase()] ?? null;
}
