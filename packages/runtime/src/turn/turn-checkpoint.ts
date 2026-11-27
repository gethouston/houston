import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import {
  type HydrateManifest,
  type ObjectStore,
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { syncTurnFilesystem, type TurnFilesystem } from "./turn-filesystem";
import type { TurnLanded } from "./turn-landed";

export const TURN_CHECKPOINT_INTERVAL_MS = 60_000;
const SLOW_CHECKPOINT_FACTOR = 5;

export interface TurnCheckpoints {
  observe(frame: WireFrame): void;
  stop(): Promise<void>;
}

export function checkpointScope(
  workspaceRel: string,
): (relativePath: string) => boolean {
  const workspace = `${workspaceRel}/`;
  const internal = `${posix.join(workspaceRel, ".houston")}/`;
  return (rel) => rel.startsWith(workspace) && !rel.startsWith(internal);
}

export function startTurnCheckpoints(input: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  conversationId: string;
  heartbeat: { readonly fenced: boolean } | null;
  landed: Pick<TurnLanded, "add">;
  intervalMs?: number;
}): TurnCheckpoints {
  const { filesystem } = input;
  filesystem.conflictCopies ??= new Map();
  filesystem.sentHashes ??= new Map();
  const interval = input.intervalMs ?? TURN_CHECKPOINT_INTERVAL_MS;
  let ready = filesystem.workspaceReady === undefined;
  filesystem.workspaceReady?.then(
    () => {
      ready = true;
    },
    () => {
      ready = true;
    },
  );
  let toolsRunning = 0;
  let dirty = false;
  let stopped = false;
  let running: Promise<void> | null = null;
  let interrupted = false;
  let nextAt = Date.now() + interval;
  const inScope = checkpointScope(filesystem.workspaceRel);
  const narrow = (rel: string) =>
    !interrupted &&
    inScope(rel) &&
    existsSync(join(filesystem.storeRoot, ...rel.split("/")));

  const checkpoint = async () => {
    const started = Date.now();
    const snapshot = new Map(filesystem.manifest);
    const landed: HydrateManifest = new Map();
    interrupted = false;
    // An entry the turn's own writes moved on during the pass stays theirs.
    const keep = (entries: HydrateManifest, uploaded: string[]) => {
      for (const [rel, entry] of entries)
        if (filesystem.manifest.get(rel) === snapshot.get(rel))
          filesystem.manifest.set(rel, entry);
      for (const rel of uploaded) filesystem.immediateWrites.add(rel);
      input.landed.add(uploaded);
    };
    try {
      const synced = await syncTurnFilesystem({
        store: input.store,
        prefix: input.prefix,
        filesystem: { ...filesystem, manifest: snapshot },
        conversationId: input.conversationId,
        claimed: true,
        narrow,
        landed,
      });
      if (interrupted) dirty = true;
      const unsettled = new Set(
        [...synced.skipped, ...synced.conflicts].map(({ key }) => key),
      );
      keep(
        new Map([...synced.manifest].filter(([rel]) => !unsettled.has(rel))),
        synced.uploaded,
      );
    } catch (error) {
      if (error instanceof StoreFencedError) {
        stopped = true;
        return;
      }
      // What landed before the throw is in the store: without its new
      // generation the next pass would skip a revert, keep a delete, or
      // meet its own write as a conflict.
      if (landed.size > 0) keep(landed, [...landed.keys()]);
      dirty = true;
      console.warn(
        `[turn] checkpoint failed conversation=${input.conversationId}`,
        error,
      );
    } finally {
      const took = Date.now() - started;
      nextAt = Date.now() + Math.max(interval, took * SLOW_CHECKPOINT_FACTOR);
    }
  };

  const tick = () => {
    if (stopped || running || !dirty || !ready || toolsRunning > 0) return;
    if (input.heartbeat?.fenced) {
      stopped = true;
      return;
    }
    if (Date.now() < nextAt) return;
    dirty = false;
    running = checkpoint().finally(() => {
      running = null;
    });
  };
  const timer = setInterval(tick, Math.min(interval, 5_000));
  timer.unref?.();

  return {
    observe(frame) {
      if (frame.type === "tool_start") {
        toolsRunning += 1;
        interrupted = true;
      } else if (frame.type === "tool_end") {
        toolsRunning = Math.max(0, toolsRunning - 1);
        dirty = true;
        tick();
      }
    },
    async stop() {
      stopped = true;
      interrupted = true;
      clearInterval(timer);
      await running;
    },
  };
}
