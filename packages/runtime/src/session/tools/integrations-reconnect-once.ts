import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { currentConversationId } from "../conversation-context";

/**
 * At most ONE reconnect card per app per conversation. A client that predates
 * the step's `reconnect` flag shows a plain connect card, and Composio still
 * reports the dead connection as active, so that card answers "connected" at
 * once, the agent retries, the app refuses again, and a new card follows,
 * forever. After the first card the agent sends the user to the Integrations
 * page instead.
 *
 * Earlier turns are found two ways: the conversation's persisted transcript
 * (pi keeps every turn's tool results in the session), and, for a backend
 * that hands tools no session (the Claude SDK bridge), this process's memory
 * of the conversations it already offered a card in.
 */

/** Stable phrase in the card guidance; the transcript scan looks for it. */
export function reconnectCardMarker(toolkit: string): string {
  return `A reconnect step for ${toolkit} was added`;
}

const MAX_REMEMBERED = 500;
const offered = new Set<string>();

function memoryKey(toolkit: string): string | undefined {
  const conversation = currentConversationId();
  return conversation ? `${conversation}\u0000${toolkit}` : undefined;
}

/** Remember that this conversation got a reconnect card for `toolkit`. */
export function rememberReconnectOffered(toolkit: string): void {
  const key = memoryKey(toolkit);
  if (!key) return;
  if (offered.size >= MAX_REMEMBERED) {
    const oldest = offered.values().next().value;
    if (oldest !== undefined) offered.delete(oldest);
  }
  offered.add(key);
}

/** Did an earlier turn of this conversation already offer the card? */
export function reconnectOfferedBefore(
  toolkit: string,
  ctx: ExtensionContext | undefined,
): boolean {
  const key = memoryKey(toolkit);
  if (key && offered.has(key)) return true;
  // The bridge's no-op context has no session manager.
  const entries = ctx?.sessionManager?.getBranch?.() ?? [];
  const marker = reconnectCardMarker(toolkit);
  return entries.some(
    (entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "integration_execute" &&
      entry.message.content.some(
        (part) => part.type === "text" && part.text.includes(marker),
      ),
  );
}
