import type { WireFrame } from "@houston/runtime-client";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { TurnServerDeps } from "./server-types";
import { startTurnCheckpoints, type TurnCheckpoints } from "./turn-checkpoint";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnLanded, type TurnLanded } from "./turn-landed";
import type { TurnRequest } from "./types";

export function startTurnProgress(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  filesystem: TurnFilesystem;
  resolved: { store: ObjectStore; prefix: string };
  heartbeat: { readonly fenced: boolean } | null;
  emit: (frame: WireFrame) => void;
  frameTaps?: Set<(frame: WireFrame) => void>;
}): {
  landed: TurnLanded;
  checkpoints: TurnCheckpoints | null;
  end(): Promise<void>;
} {
  const landed = createTurnLanded({
    deps: input.deps,
    turn: { ...input.turn, turnId: input.turnId },
    filesystem: input.filesystem,
    source: input.resolved,
    emit: input.emit,
  });
  input.filesystem.landed = landed;
  const checkpoints = input.turn.claim
    ? startTurnCheckpoints({
        store: input.resolved.store,
        prefix: input.resolved.prefix,
        filesystem: input.filesystem,
        conversationId: input.turn.conversationId,
        heartbeat: input.heartbeat,
        landed,
      })
    : null;
  if (checkpoints) input.frameTaps?.add(checkpoints.observe);
  return {
    landed,
    checkpoints,
    async end() {
      await checkpoints?.stop();
      await landed.close();
    },
  };
}
