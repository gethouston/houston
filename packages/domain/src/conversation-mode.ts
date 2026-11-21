import { type Activity, TURN_MODES, type TurnMode } from "@houston/protocol";
import { addressesMission } from "./conversation-keys";

/**
 * The turn mode a conversation keeps (HOU-205): the `mode` on the mission card
 * that addresses it, or `undefined` when no card does or the card names none.
 * A send that pins no mode runs on this; the caller supplies the default.
 *
 * The board is agent-writable file content, so a value outside the known
 * modes reads as no mode at all rather than a surprise one.
 *
 * An API-started card older than the field reads as Autopilot: every API
 * follow-up ran Autopilot before the card kept a mode, and an unattended
 * caller has nobody to answer an approval prompt. The gateway applies the same
 * rule when it can read the card (cloud `mission.followUpMode`); this is the
 * answer when it cannot and sends the follow-up with no mode.
 */
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
