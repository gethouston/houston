export type MentionKeyAction =
  | { kind: "move"; step: number }
  | { kind: "dismiss" }
  | { kind: "accept" };

export interface MentionKeyEvent {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}

export function mentionKeyAction(
  event: MentionKeyEvent,
  count: number,
): MentionKeyAction | null {
  if (count <= 0 || event.isComposing) return null;
  if (event.key === "ArrowDown") return { kind: "move", step: 1 };
  if (event.key === "ArrowUp") return { kind: "move", step: count - 1 };
  if (event.key === "Escape") return { kind: "dismiss" };
  if (event.key === "Tab") return { kind: "accept" };
  if (event.key === "Enter" && !event.shiftKey) return { kind: "accept" };
  return null;
}
