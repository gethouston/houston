import { type Activity, TURN_MODES, type TurnMode } from "@houston/protocol";
import { addressesMission } from "./conversation-keys";

/**
 * The turn mode a conversation keeps (HOU-205): the `mode` on the mission card
 * that addresses it, or `undefined` when no card does or the card names none.
 * A send that pins no mode runs on this; the caller supplies the default.
 *
 * The board is agent-writable file content, so a value outside the known
 * modes reads as no mode at all rather than a surprise one.
 */
export function conversationTurnMode(
  items: readonly Pick<Activity, "id" | "session_key" | "mode">[],
  conversationId: string,
): TurnMode | undefined {
  const mode = items.find((card) => addressesMission(card, conversationId))
    ?.mode as unknown;
  return TURN_MODES.includes(mode as TurnMode) ? (mode as TurnMode) : undefined;
}
