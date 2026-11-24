import type { TurnLandedEventType } from "@houston/protocol";
import type { WireFrame } from "@houston/runtime-client";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocSource } from "./turn-activity-source";
import { changedEventTypes } from "./turn-changed-events";
import { publishLandedFamilyDocs } from "./turn-family-docs";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishTurnViews } from "./turn-view-publish";
import type { TurnRequest } from "./types";

const ANNOUNCED_AT_TERMINAL: ReadonlySet<TurnLandedEventType> = new Set([
  "ActivityChanged",
  "ConversationsChanged",
  "CustomIntegrationsChanged",
]);

export interface TurnLanded {
  add(landed: readonly string[], deleted?: readonly string[]): void;
  settled(): Promise<void>;
  close(): Promise<void>;
}

export function createTurnLanded(input: {
  deps: TurnServerDeps;
  turn: TurnRequest & { turnId: string };
  filesystem: TurnFilesystem;
  source: ActivityDocSource;
  emit: (frame: WireFrame) => void;
}): TurnLanded {
  let queue: Promise<void> = Promise.resolve();
  let open = true;
  const land = async (
    landed: readonly string[],
    deleted: readonly string[],
  ) => {
    let changed = changedEventTypes(input.filesystem, [
      ...landed,
      ...deleted,
    ]).filter((type) => !ANNOUNCED_AT_TERMINAL.has(type));
    if (changed.length === 0) return;
    const family = await publishLandedFamilyDocs({
      deps: input.deps,
      turn: input.turn,
      filesystem: input.filesystem,
      source: input.source,
      landed,
      deleted,
    });
    for (const error of family.errors)
      console.warn(`[turn] landed ${input.turn.turnId}: ${error}`);
    const stale = new Set<TurnLandedEventType>(family.stale);
    if (changed.includes("SkillsChanged"))
      for (const type of await publishTurnViews({
        deps: input.deps,
        turn: input.turn,
        filesystem: input.filesystem,
        views: undefined,
        source: input.source,
        landed: [...landed, ...deleted],
      }))
        stale.add(type);
    changed = changed.filter((type) => !stale.has(type));
    if (!open || changed.length === 0) return;
    input.emit({
      type: "landed",
      data: { changed },
      turnId: input.turn.turnId,
    });
  };
  return {
    add(landed, deleted = []) {
      if (!open || landed.length + deleted.length === 0) return;
      queue = queue
        .then(() => land(landed, deleted))
        .catch((error: unknown) => {
          console.error(
            `[turn] landed announcement failed turn=${input.turn.turnId}`,
            error,
          );
        });
    },
    settled: () => queue,
    async close() {
      await queue;
      open = false;
    },
  };
}
