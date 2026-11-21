import { type Activity, TURN_MODES, type TurnMode } from "@houston/protocol";
import { addressesMission } from "./conversation-keys";

export function conversationTurnMode(
  items: readonly Pick<
    Activity,
    "id" | "session_key" | "mode" | "started_by"
  >[],
  conversationId: string,
): TurnMode | undefined {
  const card = items.find((item) => addressesMission(item, conversationId));
  const mode = card?.mode as unknown;
  if (TURN_MODES.includes(mode as TurnMode)) return mode as TurnMode;
  return card?.started_by === "api" ? "auto" : undefined;
}
