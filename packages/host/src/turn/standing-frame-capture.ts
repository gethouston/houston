import { isTerminalFrame, readEventStream } from "@houston/runtime-client";
import type { RuntimeEndpoint } from "../ports";
import type { TurnBus } from "./bus";
import type { FrameForwarder } from "./frame-forwarder";
import { eventChannel } from "./relay-dialect";

/** Pumps a standing runtime's SSE into ev2 without relying on a client listener. */
export class StandingFrameCapture {
  private readonly pumps = new Map<
    string,
    { controller: AbortController; attached: Promise<void> }
  >();

  constructor(
    private readonly bus: TurnBus,
    private readonly forwarder: FrameForwarder,
  ) {}

  capture(
    endpoint: RuntimeEndpoint,
    agentId: string,
    conversationId: string,
  ): Promise<void> {
    const key = `${agentId}/${conversationId}`;
    this.forwarder.capture(conversationId, key);
    const existing = this.pumps.get(key);
    if (existing) return existing.attached;
    const controller = new AbortController();
    let resolveAttached!: () => void;
    let rejectAttached!: (error: unknown) => void;
    const attached = new Promise<void>((resolve, reject) => {
      resolveAttached = resolve;
      rejectAttached = reject;
    });
    const state = { controller, attached };
    this.pumps.set(key, state);
    void this.pump(endpoint, conversationId, key, controller, resolveAttached)
      .catch((error) => {
        rejectAttached(error);
        if (!controller.signal.aborted) {
          console.debug(
            `[turnlog] standing runtime capture failed for ${conversationId}; live-pod resume remains available`,
            error,
          );
        }
      })
      .finally(() => {
        if (this.pumps.get(key) !== state) return;
        this.pumps.delete(key);
        this.forwarder.release(key);
      });
    return attached;
  }

  stopCapture(agentId: string, conversationId: string): void {
    const key = `${agentId}/${conversationId}`;
    const state = this.pumps.get(key);
    if (state) {
      this.pumps.delete(key);
      state.controller.abort();
    }
    this.forwarder.release(key);
  }

  stop(): void {
    for (const [key, state] of this.pumps) {
      state.controller.abort();
      this.forwarder.release(key);
    }
    this.pumps.clear();
  }

  private async pump(
    endpoint: RuntimeEndpoint,
    conversationId: string,
    key: string,
    controller: AbortController,
    attached: () => void,
  ): Promise<void> {
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
    const reading = readEventStream(response.body, async (frame) => {
      // A fresh runtime subscription begins with a snapshot sync. Turnlog is
      // the turn's event log, so only frames published by the turn enter ev2.
      if (frame.type === "sync") return;
      // The standing runtime's ReplayLog already assigned the authoritative
      // seq. Publish that exact envelope; never introduce a second counter.
      await this.bus.publish(eventChannel(key), JSON.stringify(frame));
      if (isTerminalFrame(frame.type)) controller.abort();
    });
    if (!response.body.locked) await reading;
    attached();
    await reading;
  }
}
