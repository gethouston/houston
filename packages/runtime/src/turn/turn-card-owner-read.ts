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

/** The conversation the card is judged from, once hydration has landed. */
export interface CardOwnerRead {
  messages: () => Promise<ChatMessage[]>;
  /** Settles when the store read (if any) has; never rejects. */
  settled: Promise<unknown>;
  /** Stop the store read; `settled` then settles promptly. */
  abort: () => void;
}

type FreshRead =
  | { kind: "hydrated" }
  | { kind: "missing" }
  | { kind: "read" }
  | { kind: "failed"; error: unknown };

/**
 * The conversation as the store holds it under this turn's claim. Hydration
 * read it under the claim unless the gateway inlined its bytes (read BEFORE
 * it held the claim, so the card the previous turn ended on can be missing
 * from them) or its prefetched listing did not name it (the card's turn may
 * have created it since). Only then is the object read again, conditioned on
 * the generation of the bytes the worker holds (the inlined object's, else
 * the listing's), so an unchanged one answers 304. It starts once the listing,
 * layout and priority inputs have landed and overlaps the bulk hydration, so
 * the 202 rarely waits for it. A read failure is answered like a failure
 * during hydration.
 */
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
