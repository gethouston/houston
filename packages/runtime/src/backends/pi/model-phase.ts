import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { HedgeObserver, SentRequestSize } from "../../ai/hedged-runtime";
import type { ModelPhase } from "../model-phase";

/** The requests one session's hedged model runtime sends, with their size. */
export class SentRequests {
  private readonly listeners = new Set<(request: SentRequestSize) => void>();

  /** `observer`, also reporting every request it is told of here. */
  observe(observer: HedgeObserver = {}): Required<HedgeObserver> {
    return {
      answered: (afterMs, attempt) => observer.answered?.(afterMs, attempt),
      hedged: (attempt) => observer.hedged?.(attempt),
      sent: (request) => {
        observer.sent?.(request);
        for (const listener of this.listeners) listener(request);
      },
    };
  }

  subscribe(listener: (request: SentRequestSize) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * pi's round-trip boundaries as `ModelPhase`s. `turn_start` precedes each
 * request, and the assistant `message_start` fires when the provider's
 * response opens (its headers, or the first stream event): between the two
 * the request is out and unanswered. An auto-retry is a request that goes out
 * after its backoff.
 *
 * pi emits `turn_start` before it appends the turn's new messages, so only the
 * hedge (ai/hedged-runtime.ts) knows the size of the request, once it sends
 * it. The first request sent after a boundary re-marks the phase with that
 * size; until then the small-prompt window covers building the request. Any
 * other request through the same runtime (a cache warm-up, a branch summary,
 * a forced tool call) moves no phase.
 */
export function subscribePiModelPhase(
  session: AgentSession,
  requests: SentRequests,
  listener: (phase: ModelPhase) => void,
): () => void {
  let awaitingRequest = false;
  const stopRequests = requests.subscribe(({ provider, promptTokens }) => {
    if (!awaitingRequest) return;
    awaitingRequest = false;
    listener({ phase: "requesting", provider, promptTokens });
  });
  const provider = () => session.model?.provider ?? "";
  const stopSession = session.subscribe((e) => {
    if (e.type === "turn_start" || e.type === "auto_retry_start") {
      awaitingRequest = true;
      listener({
        phase: "requesting",
        provider: provider(),
        ...(e.type === "auto_retry_start" ? { afterMs: e.delayMs } : {}),
      });
      return;
    }
    if (e.type === "message_start" && e.message.role === "assistant") {
      awaitingRequest = false;
      listener({ phase: "responding" });
    } else if (
      (e.type === "message_end" && e.message.role === "assistant") ||
      e.type === "compaction_start"
    ) {
      awaitingRequest = false;
      listener({ phase: "idle" });
    }
  });
  return () => {
    stopRequests();
    stopSession();
  };
}
