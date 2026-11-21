import { BrowserToolError } from "../errors";
import { type HandoffInit, HandoffSession } from "./session";

export const ENDED_RETAIN_MS = 60_000;

export class HandoffRegistry {
  private readonly latest = new Map<string, HandoffSession>();
  private readonly ended = new Map<string, HandoffSession>();

  constructor(private readonly retainMs = ENDED_RETAIN_MS) {}

  open(init: HandoffInit): HandoffSession {
    if (this.latest.get(init.conversationId)?.state === "waiting")
      throw new BrowserToolError(
        "handoff_unavailable",
        "The browser is already waiting for the person in this chat.",
      );
    const { conversationId } = init;
    const session = new HandoffSession(init);
    this.latest.set(conversationId, session);
    session.ended.then(() => {
      this.ended.set(session.handoffId, session);
      const forget = setTimeout(() => {
        this.ended.delete(session.handoffId);
        if (this.latest.get(conversationId) === session)
          this.latest.delete(conversationId);
      }, this.retainMs);
      forget.unref();
    });
    return session;
  }

  get(conversationId: string): HandoffSession | undefined {
    return this.latest.get(conversationId);
  }

  find(conversationId: string, handoffId: string): HandoffSession | undefined {
    const latest = this.latest.get(conversationId);
    if (latest?.handoffId === handoffId) return latest;
    const ended = this.ended.get(handoffId);
    return ended?.conversationId === conversationId ? ended : undefined;
  }

  end(conversationId: string, end: "done" | "cancelled" | "expired"): void {
    this.latest.get(conversationId)?.finish(end);
  }
}

export const sharedHandoffs = new HandoffRegistry();
