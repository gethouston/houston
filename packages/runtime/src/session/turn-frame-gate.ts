import type { WireFrame } from "@houston/runtime-client";
import { publish } from "./bus";
import type { Conversation } from "./conversation-cache";

export function turnFramePublisher(
  conv: Pick<Conversation, "stoppedTurnId">,
  id: string,
  turnId: string,
): (frame: WireFrame) => void {
  return (frame) => {
    if (conv.stoppedTurnId === turnId) return;
    publish(id, { ...frame, turnId });
  };
}
