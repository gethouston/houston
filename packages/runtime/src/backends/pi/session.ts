import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import type {
  ForcedToolCall,
  ForcedToolCallRequest,
} from "../forced-tool-call";
import type { ModelPhase } from "../model-phase";
import type {
  CompactionOutcome,
  HarnessSession,
  HarnessTimingEvent,
  ReplyBeat,
  ResolvedModel,
  ThinkingLevel,
} from "../types";
import {
  captureSentRequests,
  replyAfterLastRequest,
  runForcedToolCall,
  type SentRequest,
} from "./forced-tool-call";
import { planForcedToolCall } from "./forced-tool-choice";
import { createPiCallTimer } from "./model-calls";
import { type SentRequests, subscribePiModelPhase } from "./model-phase";
import { createReplyBeatReader } from "./reply-beats";
import { createWireTranslator } from "./wire";

/**
 * The pi implementation of HarnessSession: a thin wrapper over a pi
 * `AgentSession`. It runs pi's event stream through a per-subscription wire
 * translator (`createWireTranslator` — the `toWire` mapping plus block-boundary
 * separators, HOU-857) and forwards only the non-null WireEvents; every other
 * method forwards to the underlying session. The single `Model<Api>` cast lives
 * here — the seam speaks `ResolvedModel`, and the concrete objects flowing
 * through are real pi models.
 */
export class PiSession implements HarnessSession {
  private disposed = false;
  /** The last request this prompt sent, what `forceToolCall` extends. */
  private sent: SentRequest | undefined;
  /** The in-flight forced call, cut by `abort` like the prompt itself. */
  private forced: AbortController | undefined;
  /** Timing listeners for forced calls, which pi's events never carry. */
  private readonly forcedCalls = new Set<(e: HarnessTimingEvent) => void>();

  constructor(
    private readonly session: AgentSession,
    /** What the session's hedged model runtime sends (backend.ts). */
    private readonly requests: SentRequests,
  ) {
    captureSentRequests(session, (sent) => {
      this.sent = sent;
    });
  }

  subscribe(listener: (e: WireEvent) => void): () => void {
    const translate = createWireTranslator();
    return this.session.subscribe((e) => {
      const wire = translate(e);
      if (wire) listener(wire);
    });
  }

  /**
   * Every pi `AgentSessionEvent`, untranslated. The `toWire` mapping drops
   * `toolcall_delta` (a tool call's streamed input), so a turn spent writing a
   * big file emits nothing on `subscribe` for its whole generation; this is
   * the channel that still ticks then.
   */
  subscribeLiveness(listener: () => void): () => void {
    return this.session.subscribe(() => listener());
  }

  /**
   * pi's `message_start` for an ASSISTANT message: one model round-trip
   * beginning. The same event also announces user, steering, and tool-result
   * messages, which are not boundaries the finish marks care about.
   */
  subscribeAssistantMessageStart(listener: () => void): () => void {
    return this.session.subscribe((e) => {
      if (e.type === "message_start" && e.message.role === "assistant")
        listener();
    });
  }

  /** Tool-call opens and clean answer ends (`createReplyBeatReader`). */
  subscribeReplyBeats(listener: (beat: ReplyBeat) => void): () => void {
    const read = createReplyBeatReader();
    return this.session.subscribe((e) => {
      const beat = read(e);
      if (beat) listener(beat);
    });
  }

  /** pi's round-trip boundaries as `ModelPhase`s (`subscribePiModelPhase`). */
  subscribeModelPhase(listener: (phase: ModelPhase) => void): () => void {
    return subscribePiModelPhase(this.session, this.requests, listener);
  }

  /** One timing per answered request (`createPiCallTimer`); pi is in-process,
   *  so there is no harness start cost to report. */
  subscribeModelCalls(
    listener: (event: HarnessTimingEvent) => void,
  ): () => void {
    const timer = createPiCallTimer();
    this.forcedCalls.add(listener);
    const unsubscribe = this.session.subscribe((e) => {
      const call = timer(e);
      if (call) listener({ type: "call", call });
    });
    return () => {
      this.forcedCalls.delete(listener);
      unsubscribe();
    };
  }

  prompt(text: string): Promise<void> {
    this.sent = undefined;
    return this.session.prompt(text);
  }

  /**
   * One request outside pi's agent loop (forced-tool-call.ts): no session
   * event fires, nothing is appended to the session, and the tool never runs.
   */
  async forceToolCall(request: ForcedToolCallRequest): Promise<ForcedToolCall> {
    // One forced call per prompt; the captured request (the whole transcript
    // as sent) is not held past it.
    const sent = this.sent;
    this.sent = undefined;
    if (!this.session.getActiveToolNames().includes(request.toolName))
      return { outcome: "unavailable", reason: "tool not offered" };
    const reply = replyAfterLastRequest(this.session.messages);
    if (!sent || !reply)
      return { outcome: "unavailable", reason: "no finished reply" };
    // Only where the provider honors a forced call: elsewhere the request
    // would mostly come back as text and only delay the turn's end.
    const plan = planForcedToolCall(sent.model, request.toolName);
    if (plan.kind === "unsupported")
      return { outcome: "unsupported", reason: plan.reason };
    const forced = new AbortController();
    this.forced = forced;
    try {
      const { result, call } = await runForcedToolCall({
        runtime: this.session.modelRuntime,
        sent,
        plan,
        reply,
        request: {
          ...request,
          signal: AbortSignal.any([request.signal, forced.signal]),
        },
      });
      if (call)
        for (const listener of this.forcedCalls)
          listener({ type: "call", call });
      return result;
    } finally {
      // A late finish of an aborted call must not drop a newer call's handle.
      if (this.forced === forced) this.forced = undefined;
    }
  }

  abort(): Promise<void> {
    this.forced?.abort();
    return this.session.abort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
  }

  async setModel(model: ResolvedModel): Promise<void> {
    await this.session.setModel(model as unknown as Model<Api>);
  }

  compact(customInstructions?: string): Promise<CompactionOutcome> {
    return this.session.compact(customInstructions);
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.session.setThinkingLevel(level);
  }

  getContextUsage(): { tokens: number | null } | undefined {
    return this.session.getContextUsage();
  }
}
