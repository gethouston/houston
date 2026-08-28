import type { WireFrame } from "@houston/runtime-client";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnModelRuntime } from "./turn-runtime";
import type { TurnRequest } from "./types";

/** Resolve a shadow turn's model without creating a provider session. */
export async function executeShadowTurn(input: {
  turn: TurnRequest;
  turnId: string;
  filesystem: TurnFilesystem;
  timings: Record<string, number>;
  emit: (frame: WireFrame) => void;
}): Promise<void> {
  try {
    if (!input.turn.credential)
      throw new Error("shadow turn needs a credential");
    await createTurnModelRuntime(
      input.filesystem.dataDir,
      input.turn.provider || input.turn.credential.provider,
      input.turn.model,
      input.timings,
    );
    input.emit({
      type: "shadow",
      data: {
        ...input.timings,
        hydratedObjects: input.filesystem.manifest.size,
        skippedObjects: input.filesystem.skippedObjects,
      },
      turnId: input.turnId,
    } as unknown as WireFrame);
    input.emit({ type: "done", data: null, turnId: input.turnId });
  } catch (error) {
    input.emit({
      type: "error",
      data: { message: error instanceof Error ? error.message : String(error) },
      turnId: input.turnId,
    });
  }
}
