import type { SequencedFrame } from "@houston/runtime-client";
import {
  capturePodFence,
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";
import type { TurnLogSender } from "./frame-forwarder";

const RETRYABLE = new Set([502, 503, 504]);

export class HttpTurnLogSender implements TurnLogSender {
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: number[];

  constructor(
    private readonly opts: {
      gateway: PodGatewayConfig;
      fetchImpl?: typeof fetch;
      retryDelaysMs?: number[];
    },
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retryDelaysMs = opts.retryDelaysMs ?? [500, 2_000];
  }

  async send(conversationId: string, frames: SequencedFrame[]): Promise<void> {
    const { gateway } = this.opts;
    const url = podGatewayUrl(
      gateway,
      `/v1/pod/turnlog/${encodeURIComponent(gateway.orgSlug)}/${encodeURIComponent(gateway.agentSlug)}/${encodeURIComponent(conversationId)}`,
    );
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: podGatewayHeaders(gateway, { write: true, json: true }),
          // The ingest wire shape is a bare array of {seq, frame} — seq is
          // the producer cursor, frame the FULL wire frame verbatim (seq
          // included) so a replayed frame is byte-equivalent to a live one.
          body: JSON.stringify(
            frames.map((frame) => ({ seq: frame.seq, frame })),
          ),
          signal: AbortSignal.timeout(5_000),
        });
        capturePodFence(gateway, response);
        if (response.ok) return;
        const detail = await response.text();
        lastError = new Error(
          `turnlog ingest failed (${response.status}): ${detail.slice(0, 300)}`,
        );
        if (!RETRYABLE.has(response.status)) break;
      } catch (error) {
        lastError = error;
      }
      const delay = this.retryDelaysMs[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("turnlog ingest failed");
  }
}
