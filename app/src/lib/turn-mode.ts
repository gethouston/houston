export type TurnMode = "execute" | "plan" | "auto";

export const DEFAULT_TURN_MODE: TurnMode = "execute";

export function normalizeTurnMode(value: unknown): TurnMode {
  if (value === "plan") return "plan";
  if (value === "auto") return "auto";
  if (value === "execute") return "execute";
  return DEFAULT_TURN_MODE;
}

export interface PickedTurnMode {
  cardId: string;
  mode: TurnMode;
  from: unknown;
}

export function pickSettled(
  picked: PickedTurnMode,
  card: { id: string; mode?: unknown } | null,
): boolean {
  if (card?.id !== picked.cardId) return false;
  return card.mode === picked.mode || card.mode !== picked.from;
}

export function resolveConversationTurnMode(input: {
  card: { id: string; mode?: unknown } | null;
  picked: PickedTurnMode | null;
  localMode: TurnMode;
  fallback: TurnMode;
}): TurnMode {
  const { card, picked, localMode, fallback } = input;
  if (!card) return localMode;
  if (picked?.cardId === card.id) return picked.mode;
  return card.mode === undefined ? fallback : normalizeTurnMode(card.mode);
}
