import type { WireEvent } from "@houston/runtime-client";
import type { HarnessTimingEvent, ReplyBeat, ThinkingLevel } from "../types";
import type { ClaudeSessionDeps } from "./session-deps";

export interface TurnAttemptState {
  readonly deps: ClaudeSessionDeps;
  readonly model: string;
  readonly thinkingLevel: ThinkingLevel | undefined;
  beginAttempt(controller: AbortController): void;
  isAborting(): boolean;
  setContextTokens(tokens: number): void;
  setUsedAccessDigest(digest: string | undefined): void;
  setRetryReason(reason: string): void;
  emit(e: WireEvent): void;
  tickLiveness(): void;
  emitAssistantMessageStart(): void;
  emitReplyBeat(beat: ReplyBeat): void;
  emitTiming(e: HarnessTimingEvent): void;
}

export interface TurnAttemptInput {
  text: string;
  resume: string | undefined;
  promptTokens: number;
}
