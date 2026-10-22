import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { effectiveModelWindow } from "@houston/protocol/model-windows";
import type { ChatMessage } from "@houston/runtime-client";
import type { HarnessSession, ResolvedModel } from "../backends/types";
import { needsAutocompact } from "../session/autocompact";
import {
  type AutocompactCooldown,
  runAutocompact,
} from "../session/autocompact-guard";
import type { FactHarvestTarget } from "../session/durable-facts-harvest";
import { recordedContextFill } from "../session/recorded-context-fill";

/**
 * Houston's proactive autocompact for a POOLED turn: the standing server's
 * rule (session/exec-turn.ts) on a session that lives for one request.
 *
 * Two things the pod gets from living long have to come from the tree here:
 *
 * - THE FILL. pi reads it from the resumed session file. The Claude backend
 *   only knows it after a turn in the same process, which a pooled turn never
 *   has, so it falls back to the usage the conversation's last reply recorded
 *   (the last request's fill, the same number the Claude session tracks).
 * - THE COOLDOWN. A failed compaction holds the conversation off for five
 *   minutes so a doomed summarization is not paid on every turn. In process
 *   memory that hold would die with the turn, and every later turn would pay
 *   for another failed summary of a nearly full window; it lives in the
 *   conversation's session dir instead, which the claim hydrates and syncs.
 */

const COOLDOWN_FILE = "autocompact.json";

export function turnAutocompactCooldownFile(
  dataDir: string,
  conversationId: string,
): string {
  return join(dataDir, "sessions", conversationId, COOLDOWN_FILE);
}

/** A cooldown that travels with the conversation's synced session dir. */
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
        return undefined; // no hold recorded
      }
      try {
        const { retryAfter } = JSON.parse(raw) as { retryAfter?: unknown };
        if (typeof retryAfter === "number" && Number.isFinite(retryAfter))
          return retryAfter;
        throw new Error("retryAfter is not a number");
      } catch (error) {
        // A corrupt hold degrades to "none": one extra attempt, never a
        // conversation that can no longer compact.
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

/**
 * The context fill this turn starts from: the session's own reading, else the
 * last reply's recorded usage.
 */
export function pooledContextFill(
  session: HarnessSession,
  canonical: readonly ChatMessage[],
  transcriptFill: boolean,
): number | null {
  const own = session.getContextUsage();
  if (own !== undefined) return own.tokens;
  // pi answers undefined only for a model with no window, where the pod
  // never compacts either.
  if (!transcriptFill) return null;
  return recordedContextFill(canonical) ?? null;
}

/**
 * Compact `session` before the prompt when it is nearly full. Returns the
 * boundary marker the turn announces and persists, or undefined when it did
 * not compact (under the threshold, cooling down, or the attempt failed:
 * the turn then runs uncompacted, as on the pod).
 */
export async function autocompactPooledSession(input: {
  session: HarnessSession;
  model: ResolvedModel;
  dataDir: string;
  conversationId: string;
  canonical: readonly ChatMessage[];
  /** Read the fill from the transcript when the session cannot (Claude). */
  transcriptFill: boolean;
  harvest: FactHarvestTarget;
  /** The person's cancel: it stops the summary, as Stop does on the pod. */
  signal?: AbortSignal;
  now?: number;
}): Promise<ChatMessage["compaction"]> {
  const { session, model, conversationId, signal } = input;
  if (signal?.aborted) return undefined;
  const fill = pooledContextFill(
    session,
    input.canonical,
    input.transcriptFill,
  );
  // The same denominator the pod and the context bar divide by.
  const window = effectiveModelWindow(
    model.provider,
    model.id,
    model.contextWindow,
    fill ?? 0,
  );
  if (!needsAutocompact(fill, window)) return undefined;
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
