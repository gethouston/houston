import type { ModelCallTiming } from "@houston/protocol";
import type { WireEvent } from "@houston/runtime-client";
import type { PiThinkingLevel } from "../ai/effort";
import type { CreateSessionOptions } from "./create-session-options";
import type { ModelPhase } from "./model-phase";
import type { ReplyBeat } from "./reply-beat";

export type { CreateSessionOptions } from "./create-session-options";
export type { ReplyBeat } from "./reply-beat";

export type ThinkingLevel = PiThinkingLevel;

export interface ResolvedModel {
  readonly provider: string;
  readonly id: string;
  readonly contextWindow: number;
  readonly reasoning?: boolean;
}

export interface CompactionOutcome {
  summary: string;
}

export type HarnessTimingEvent =
  | { type: "call"; call: ModelCallTiming }
  | { type: "harness_init"; ms: number };

export interface HarnessSession {
  subscribe(listener: (e: WireEvent) => void): () => void;
  subscribeLiveness?(listener: () => void): () => void;
  subscribeAssistantMessageStart?(listener: () => void): () => void;
  subscribeReplyBeats?(listener: (beat: ReplyBeat) => void): () => void;
  subscribeModelPhase?(listener: (phase: ModelPhase) => void): () => void;
  subscribeModelCalls?(
    listener: (event: HarnessTimingEvent) => void,
  ): () => void;
  prompt(text: string): Promise<void>;
  clearStaleToolResults?(): number;
  followUpPassServed?(): boolean;
  oneShotText?(request: {
    systemPrompt: string;
    prompt: string;
    signal: AbortSignal;
  }): Promise<string>;
  abort(): Promise<void>;
  dispose(): void;
  setModel(model: ResolvedModel): Promise<void>;
  compact(customInstructions?: string): Promise<CompactionOutcome | undefined>;
  setThinkingLevel(level: ThinkingLevel): void;
  getContextUsage(): { tokens: number | null } | undefined;
  getUsedAccessDigest?(): string | undefined;
}

export interface HarnessBackend {
  readonly id: string;
  createSession(opts: CreateSessionOptions): Promise<HarnessSession>;
}
