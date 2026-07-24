import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import type { HarnessSession, ResolvedModel, ThinkingLevel } from "../types";
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

  constructor(private readonly session: AgentSession) {}

  subscribe(listener: (e: WireEvent) => void): () => void {
    const translate = createWireTranslator();
    return this.session.subscribe((e) => {
      const wire = translate(e);
      if (wire) listener(wire);
    });
  }

  prompt(text: string): Promise<void> {
    return this.session.prompt(text);
  }

  abort(): Promise<void> {
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

  async compact(): Promise<void> {
    await this.session.compact();
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.session.setThinkingLevel(level);
  }

  getContextUsage(): { tokens: number | null } | undefined {
    return this.session.getContextUsage();
  }
}
