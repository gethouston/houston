import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { HedgeObserver, SentRequestSize } from "../../ai/hedged-runtime";
import type { ModelPhase } from "../model-phase";

export class SentRequests {
  private readonly listeners = new Set<(request: SentRequestSize) => void>();

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
