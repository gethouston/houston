import type { WireEvent } from "@houston/runtime-client";
import type { HarnessTimingEvent, ReplyBeat, ThinkingLevel } from "../types";
import type { ClaudeSessionDeps } from "./session-deps";

/**
 * The exact slice of `ClaudeSession` one attempt reads and writes, handed over
 * explicitly so the attempt owns no hidden view of the session's fields. The
 * session rebuilds it per attempt, so the values are the ones in force NOW.
 */
export interface TurnAttemptState {
  readonly deps: ClaudeSessionDeps;
  /** The SDK model string this attempt spawns with. */
  readonly model: string;
  readonly thinkingLevel: ThinkingLevel | undefined;
  /**
   * Clear the session's abort flag and register this attempt's controller, so
   * the user's Stop (and dispose) cancels the query that is about to run.
   */
  beginAttempt(controller: AbortController): void;
  /** Whether the user's Stop already fired for this attempt. */
  isAborting(): boolean;
  setContextTokens(tokens: number): void;
  /** Record the digest of the OAuth access token this attempt runs on. */
  setUsedAccessDigest(digest: string | undefined): void;
  /** Why this attempt asked for a fresh rerun, for the session's warn line. */
  setRetryReason(reason: string): void;
  emit(e: WireEvent): void;
  tickLiveness(): void;
  /** One model round-trip beginning, for the turn's finish marks. */
  emitAssistantMessageStart(): void;
  /** A reply beat (`replyBeatOf`), for the turn's finish marks. */
  emitReplyBeat(beat: ReplyBeat): void;
  emitTiming(e: HarnessTimingEvent): void;
}

/**
 * The per-attempt inputs: the prompt, the resume id to try, and the largest
 * prompt the attempt's turn sends (`claudeTurnPromptTokens`), which sizes the
 * first-byte deadline of the env it runs on.
 */
export interface TurnAttemptInput {
  text: string;
  resume: string | undefined;
  promptTokens: number;
}
