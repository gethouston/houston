import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { currentConversationId } from "../conversation-context";
import {
  RECONNECT_OFFERED_FILE,
  readConversationMark,
  writeConversationMark,
} from "../conversation-marks";

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
  const persisted = persistedToolkits();
  if (!persisted.includes(toolkit))
    writeConversationMark(RECONNECT_OFFERED_FILE, {
      toolkits: [...persisted, toolkit],
    });
}

function persistedToolkits(): string[] {
  const raw = readConversationMark(RECONNECT_OFFERED_FILE);
  if (typeof raw !== "object" || raw === null || !("toolkits" in raw))
    return [];
  const { toolkits } = raw;
  return Array.isArray(toolkits)
    ? toolkits.filter(
        (toolkit): toolkit is string => typeof toolkit === "string",
      )
    : [];
}

export function reconnectOfferedBefore(
  toolkit: string,
  ctx: ExtensionContext | undefined,
): boolean {
  const key = memoryKey(toolkit);
  if (key && offered.has(key)) return true;
  if (persistedToolkits().includes(toolkit)) return true;
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

export function resetReconnectOfferedMemory(): void {
  offered.clear();
}
