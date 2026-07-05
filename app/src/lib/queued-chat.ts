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
