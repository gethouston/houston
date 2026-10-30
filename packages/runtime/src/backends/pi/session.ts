import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { oneShotText } from "../../session/one-shot";
import type { ModelPhase } from "../model-phase";
import type {
  CompactionOutcome,
  HarnessSession,
  HarnessTimingEvent,
  ReplyBeat,
  ResolvedModel,
  ThinkingLevel,
} from "../types";
import { followUpPassServes } from "./follow-up-models";
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
  private oneShot: AbortController | undefined;
  private readonly oneShotCalls = new Set<
    (event: HarnessTimingEvent) => void
  >();

  constructor(
    private readonly session: AgentSession,
    /** What the session's hedged model runtime sends (backend.ts). */
    private readonly requests: SentRequests,
  ) {}

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
    this.oneShotCalls.add(listener);
    const unsubscribe = this.session.subscribe((e) => {
      const call = timer(e);
      if (call) listener({ type: "call", call });
    });
    return () => {
      this.oneShotCalls.delete(listener);
      unsubscribe();
    };
  }

  prompt(text: string): Promise<void> {
    return this.session.prompt(text);
  }

  followUpPassServed(): boolean {
    const model = this.session.model;
    return model !== undefined && followUpPassServes(model);
  }

  async oneShotText(request: {
    systemPrompt: string;
    prompt: string;
    signal: AbortSignal;
  }): Promise<string> {
    const controller = new AbortController();
    this.oneShot = controller;
    try {
      return await oneShotText({
        cwd: this.session.sessionManager.getCwd(),
        model: this.session.model,
        modelRuntime: this.session.modelRuntime,
        ...request,
        signal: AbortSignal.any([request.signal, controller.signal]),
        thinkingLevel: "minimal",
        autoRetry: false,
        transport: "sse",
        onModelCall: (event) => {
          for (const listener of this.oneShotCalls) listener(event);
        },
      });
    } finally {
      if (this.oneShot === controller) this.oneShot = undefined;
    }
  }

  abort(): Promise<void> {
    this.oneShot?.abort();
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
