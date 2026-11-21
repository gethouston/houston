import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { currentConversationId } from "../conversation-context";

export function reconnectCardMarker(toolkit: string): string {
  return `A reconnect step for ${toolkit} was added`;
}

const MAX_REMEMBERED = 500;
const offered = new Set<string>();

function memoryKey(toolkit: string): string | undefined {
  const conversation = currentConversationId();
  return conversation ? `${conversation}\u0000${toolkit}` : undefined;
}

export function rememberReconnectOffered(toolkit: string): void {
  const key = memoryKey(toolkit);
  if (!key) return;
  if (offered.size >= MAX_REMEMBERED) {
    const oldest = offered.values().next().value;
    if (oldest !== undefined) offered.delete(oldest);
  }
  offered.add(key);
}

export function reconnectOfferedBefore(
  toolkit: string,
  ctx: ExtensionContext | undefined,
): boolean {
  const key = memoryKey(toolkit);
  if (key && offered.has(key)) return true;
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
