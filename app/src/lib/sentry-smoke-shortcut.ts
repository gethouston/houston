export type SentrySmokeAction = "javascript" | "native";

export interface SentrySmokeKeyState {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}

export function sentrySmokeActionForKey(
  event: SentrySmokeKeyState,
): SentrySmokeAction | null {
  if (!event.ctrlKey || !event.altKey || !event.shiftKey) return null;
  const key = event.key.toLowerCase();
  if (key === "j") return "javascript";
  if (key === "n") return "native";
  return null;
}
