import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import {
  effectiveModelWindow,
  modelInputLimit,
} from "@houston/protocol/model-windows";
import type { ChatMessage } from "@houston/runtime-client";
import type { HarnessSession, ResolvedModel } from "../backends/types";
import { needsAutocompact } from "../session/autocompact";
import {
  type AutocompactCooldown,
  runAutocompact,
} from "../session/autocompact-guard";
import type { FactHarvestTarget } from "../session/durable-facts-harvest";
import { recordedContextFill } from "../session/recorded-context-fill";

const COOLDOWN_FILE = "autocompact.json";

export function turnAutocompactCooldownFile(
  dataDir: string,
  conversationId: string,
): string {
  return join(dataDir, "sessions", conversationId, COOLDOWN_FILE);
}

export function turnAutocompactCooldown(
  dataDir: string,
  conversationId: string,
): AutocompactCooldown {
  const file = turnAutocompactCooldownFile(dataDir, conversationId);
  return {
    retryAfter() {
      let raw: string;
      try {
        raw = readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
      try {
        const { retryAfter } = JSON.parse(raw) as { retryAfter?: unknown };
        if (typeof retryAfter === "number" && Number.isFinite(retryAfter))
          return retryAfter;
        throw new Error("retryAfter is not a number");
      } catch (error) {
        console.warn(
          `[autocompact] cooldown unreadable, ignoring it (${file}): ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      }
    },
    hold(until) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        const tmp = atomicTempPath(file);
        writeFileSync(tmp, JSON.stringify({ retryAfter: until }));
        renameSync(tmp, file);
      } catch (error) {
        console.error(
          `[autocompact] could not record the cooldown (${file}):`,
          error,
        );
      }
    },
  };
}

export function pooledContextFill(
  session: HarnessSession,
  canonical: readonly ChatMessage[],
  transcriptFill: boolean,
): number | null {
  const own = session.getContextUsage();
  if (own !== undefined) return own.tokens;
  if (!transcriptFill) return null;
  return recordedContextFill(canonical) ?? null;
}

export async function autocompactPooledSession(input: {
  session: HarnessSession;
  model: ResolvedModel;
  dataDir: string;
  conversationId: string;
  canonical: readonly ChatMessage[];
  transcriptFill: boolean;
  clearedTokens?: number;
  harvest: FactHarvestTarget;
  signal?: AbortSignal;
  now?: number;
}): Promise<ChatMessage["compaction"]> {
  const { session, model, conversationId, signal } = input;
  if (signal?.aborted) return undefined;
  const read = pooledContextFill(
    session,
    input.canonical,
    input.transcriptFill,
  );
  const fill =
    read === null ? null : Math.max(0, read - (input.clearedTokens ?? 0));
  const window = effectiveModelWindow(
    model.provider,
    model.id,
    model.contextWindow,
    fill ?? 0,
  );
  if (!needsAutocompact(fill, window, undefined, modelInputLimit(model.id)))
    return undefined;
  const onAbort = () => void session.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const compacted = await runAutocompact(
      session,
      conversationId,
      { provider: model.provider, id: model.id },
      input.now ?? Date.now(),
      {
        cooldown: turnAutocompactCooldown(input.dataDir, conversationId),
        harvest: input.harvest,
      },
    );
    return compacted ? { trigger: "proactive", pre_tokens: fill } : undefined;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
