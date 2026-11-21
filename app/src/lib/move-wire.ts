import type { MoveWire } from "./move-resume";
import { isExpectedMoveAnswer } from "./share-error";
import { tauriOrg } from "./tauri";

export const moveWire: MoveWire = {
  moveAgent: (agentId, toSlug) =>
    tauriOrg.moveAgent(agentId, toSlug, {
      toast: false,
      silence: isExpectedMoveAnswer,
    }),
  moveStatus: (agentId, moveId) =>
    tauriOrg.moveStatus(agentId, moveId, { toast: false }),
};
