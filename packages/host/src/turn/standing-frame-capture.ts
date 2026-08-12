import { isTerminalFrame, readEventStream } from "@houston/runtime-client";
import type { RuntimeEndpoint } from "../ports";
import type { TurnBus } from "./bus";
import type { FrameForwarder } from "./frame-forwarder";
import { eventChannel } from "./relay-dialect";

/** Pumps a standing runtime's SSE into ev2 without relying on a client listener. */
export class StandingFrameCapture {
  private readonly pumps = new Map<string, AbortController>();

  constructor(
    private readonly bus: TurnBus,
    private readonly forwarder: FrameForwarder,
  ) {}

  capture(
    endpoint: RuntimeEndpoint,
    agentId: string,
    conversationId: string,
  ): void {
    const key = `${agentId}/${conversationId}`;
    this.forwarder.capture(conversationId, key);
    if (this.pumps.has(key)) return;
    const controller = new AbortController();
    this.pumps.set(key, controller);
    void this.pump(endpoint, conversationId, key, controller).catch((error) => {
      if (!controller.signal.aborted) {
        console.debug(
          `[turnlog] standing runtime capture failed for ${conversationId}; live-pod resume remains available`,
          error,
        );
      }
    });
  }

  stop(): void {
    for (const controller of this.pumps.values()) controller.abort();
    this.pumps.clear();
  }

  private async pump(
    endpoint: RuntimeEndpoint,
    conversationId: string,
    key: string,
    controller: AbortController,
  ): Promise<void> {
    try {
      const response = await fetch(
        `${endpoint.baseUrl}/conversations/${encodeURIComponent(conversationId)}/events`,
        {
          headers: { Authorization: `Bearer ${endpoint.token}` },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`runtime events failed (${response.status})`);
      }
      await readEventStream(response.body, async (frame) => {
        // A fresh runtime subscription begins with a snapshot sync. Turnlog is
        // the turn's event log, so only frames published by the turn enter ev2.
        if (frame.type === "sync") return;
        // The standing runtime's ReplayLog already assigned the authoritative
        // seq. Publish that exact envelope; never introduce a second counter.
        await this.bus.publish(eventChannel(key), JSON.stringify(frame));
        if (isTerminalFrame(frame.type)) controller.abort();
      });
    } finally {
      this.pumps.delete(key);
    }
  }
}
