export interface QueuedChatPayload {
  text: string;
  files: readonly File[];
}

export function formatVisibleMessageText(
  text: string,
  files: readonly File[],
  formatAttached: (names: string) => string = (names) => `Attached: ${names}`,
): string {
  if (files.length === 0) return text;
  const names = files.map((file) => file.name).join(", ");
  return `${text}${text ? "\n\n" : ""}${formatAttached(names)}`;
}

export function combineQueuedMessageText(
  items: readonly QueuedChatPayload[],
): string {
  return items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function combineQueuedMessageFiles(
  items: readonly QueuedChatPayload[],
): File[] {
  return items.flatMap((item) => [...item.files]);
}

export function combineQueuedVisibleText(
  items: readonly QueuedChatPayload[],
): string {
  return items
    .map((item) => formatVisibleMessageText(item.text.trim(), item.files))
    .filter(Boolean)
    .join("\n\n");
}
