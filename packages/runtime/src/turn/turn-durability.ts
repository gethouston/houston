import { StoreFencedError } from "@houston/runtime-client/object-sync";
import type { ClaimHeartbeat } from "./claim-heartbeat";
import type { TurnServerDeps } from "./server-types";
import { syncTurnFilesystem, type TurnFilesystem } from "./turn-filesystem";
import type { TurnOutcome } from "./turn-session";
import type { ResolvedTurnStore } from "./turn-store";
import type {
  TranscriptPublishResult,
  TurnTranscript,
} from "./turn-transcript";
import type { TurnRequest } from "./types";

interface TurnDurabilityOptions {
  deps: TurnServerDeps;
  turn: TurnRequest & { turnId: string };
  filesystem: TurnFilesystem;
  resolved: ResolvedTurnStore;
  heartbeat: ClaimHeartbeat | null;
  outcome: TurnOutcome;
  /** The turn's transcript publisher (created at turn start; null = none). */
  transcript: TurnTranscript | null;
}

export interface TurnDurabilityResult {
  outcome: TurnOutcome;
  poolWritesOutOfScope: number;
  /** Set when transcript rows were deliberately not published. */
  transcriptSkipped?: "route_absent";
}

function appendError(outcome: TurnOutcome, error: string): TurnOutcome {
  return { error: outcome.error ? `${outcome.error}; ${error}` : error };
}

/** Make claimed-turn state durable before the caller emits a terminal frame. */
export async function finishTurnDurability(
  opts: TurnDurabilityOptions,
): Promise<TurnDurabilityResult> {
  await opts.heartbeat?.checkpoint();
  if (opts.heartbeat?.fenced) {
    return { outcome: { error: "claim_fenced" }, poolWritesOutOfScope: 0 };
  }

  let poolWritesOutOfScope: number;
  try {
    // Failed provider work may still have durable tool writes. Only a fence
    // may skip sync because a fenced worker no longer owns this conversation.
    poolWritesOutOfScope = await syncTurnFilesystem({
      store: opts.resolved.store,
      prefix: opts.resolved.prefix,
      filesystem: opts.filesystem,
      conversationId: opts.turn.conversationId,
      claimed: Boolean(opts.turn.claim),
    });
  } catch (error) {
    // A fenced object write means the claim was adopted mid-sync: report it
    // as exactly that, not as a generic sync failure.
    if (error instanceof StoreFencedError) {
      return { outcome: { error: "claim_fenced" }, poolWritesOutOfScope: 0 };
    }
    const message = error instanceof Error ? error.message : String(error);
    const failure = opts.outcome.error
      ? `sync failed: ${message}`
      : `workspace sync failed: ${message}`;
    return {
      outcome: appendError(opts.outcome, failure),
      poolWritesOutOfScope: 0,
    };
  }

  // The object copy must land first. Otherwise history fallback could expose
  // transcript rows whose authoritative conversation file is still missing.
  let published: TranscriptPublishResult | undefined;
  try {
    published = await opts.transcript?.publish();
  } catch (error) {
    published = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (published && "fenced" in published) {
    return { outcome: { error: "claim_fenced" }, poolWritesOutOfScope };
  }
  if (published && "error" in published) {
    return {
      outcome: appendError(
        opts.outcome,
        `transcript publish failed: ${published.error}`,
      ),
      poolWritesOutOfScope,
    };
  }
  // The claim may have been adopted while sync/publish were in flight (the
  // heartbeat loop learns it asynchronously). A last checkpoint keeps a stale
  // worker from ever announcing a clean done.
  await opts.heartbeat?.checkpoint();
  if (opts.heartbeat?.fenced) {
    return { outcome: { error: "claim_fenced" }, poolWritesOutOfScope };
  }
  return {
    outcome: opts.outcome,
    poolWritesOutOfScope,
    ...(published && "disabled" in published
      ? { transcriptSkipped: published.reason }
      : {}),
  };
}
