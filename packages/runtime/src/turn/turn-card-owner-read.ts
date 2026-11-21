import { dirname, join, posix } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import {
  ObjectNotFoundError,
  type ReadResult,
} from "@houston/runtime-client/object-sync";
import { loadConversation } from "../store/conversation-file";
import type { TurnFilesystem } from "./turn-filesystem";
import { turnHydrationError } from "./turn-hydration-error";
import type { ResolvedTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

export interface CardOwnerRead {
  messages: () => Promise<ChatMessage[]>;
  settled: Promise<unknown>;
  abort: () => void;
}

type FreshRead =
  | { kind: "hydrated" }
  | { kind: "missing" }
  | { kind: "read" }
  | { kind: "failed"; error: unknown };

export function startCardOwnerRead(
  turn: TurnRequest,
  filesystem: TurnFilesystem,
  resolved: ResolvedTurnStore,
  timings: Record<string, number>,
): CardOwnerRead {
  const file = `${encodeURIComponent(turn.conversationId)}.json`;
  const key = posix.join(filesystem.dataRel, "conversations", file);
  const at = resolved.prefix ? posix.join(resolved.prefix, key) : key;
  const listed = turn.prefetch?.manifest.find((object) => object.key === at);
  const inlined = resolved.inlined?.get(at);
  const live = resolved.live;
  const stale =
    turn.prefetch !== undefined &&
    (listed === undefined || inlined !== undefined);
  const stop = new AbortController();
  const scratch = join(dirname(filesystem.storeRoot), "card-owner");
  const read: Promise<FreshRead> =
    live && stale
      ? readFresh(live, at, join(scratch, file), {
          held: inlined?.generation ?? listed?.generation,
          signal: stop.signal,
        }).then((result) => {
          timings.t_card_read = performance.now();
          return result;
        })
      : Promise.resolve({ kind: "hydrated" });
  return {
    settled: read,
    abort: () => stop.abort(new Error("turn setup failed")),
    messages: async () => {
      const fresh = await read;
      if (fresh.kind === "failed") throw turnHydrationError(fresh.error);
      if (fresh.kind === "missing") return [];
      const dir =
        fresh.kind === "read"
          ? scratch
          : join(filesystem.dataDir, "conversations");
      return loadConversation(dir, turn.conversationId)?.messages ?? [];
    },
  };
}

async function readFresh(
  live: NonNullable<ResolvedTurnStore["live"]>,
  at: string,
  destFile: string,
  { held, signal }: { held: string | undefined; signal: AbortSignal },
): Promise<FreshRead> {
  const opts = held ? { ifGenerationNotMatch: held, signal } : { signal };
  try {
    const result = live.downloadVersioned
      ? await live.downloadVersioned(at, destFile, opts)
      : await live.download(at, destFile, opts).then(() => ({}) as ReadResult);
    return result.notModified ? { kind: "hydrated" } : { kind: "read" };
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return { kind: "missing" };
    return { kind: "failed", error };
  }
}
