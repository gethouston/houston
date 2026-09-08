/**
 * CONVERSATION COMMANDS — the slash instructions a user gives the conversation
 * itself rather than the agent.
 *
 * They are understood by the RUNTIME, not by any one client: every channel
 * (the desktop composer, a relayed WhatsApp or Slack message) delivers plain
 * text through the same turn route, so a command works everywhere the moment it
 * works here, with no per-channel parsing to keep in step. This module is the
 * PURE half — recognizing one; running it is `conversation-command-run.ts`.
 *
 * EXACT MATCH IS THE WHOLE CONTRACT. "/clear the kitchen table" is a person
 * talking to their assistant, and a person's words must always reach the model.
 * So a command is only ever a message that is nothing but the command, and an
 * unrecognized `/something` is passed through as ordinary text — Houston does
 * not own the slash character.
 */

/** What a recognized command does. */
export type ConversationCommand = "clear" | "compact";

/**
 * The literals users type, mapped to their command. `/compress` is an alias for
 * `/compact`: both words are in common use for the same idea, and guessing
 * wrong should not cost the user a message.
 */
const COMMANDS: Readonly<Record<string, ConversationCommand>> = {
  "/clear": "clear",
  "/compact": "compact",
  "/compress": "compact",
};

/**
 * The command a message IS, or null when the message is ordinary text for the
 * model. Case-insensitive and whitespace-tolerant, since the composer and the
 * relays each add their own trailing newlines.
 */
export function parseConversationCommand(
  text: string,
): ConversationCommand | null {
  return COMMANDS[text.trim().toLowerCase()] ?? null;
}
