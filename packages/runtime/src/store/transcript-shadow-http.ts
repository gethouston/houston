import { transcriptTurnRequest } from "@houston/runtime-client";
import type {
  TranscriptShadowSend,
  TranscriptShadowTransport,
} from "./transcript-shadow";

export class SandboxTranscriptShadowTransport
  implements TranscriptShadowTransport
{
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly sandboxToken: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async send(operation: TranscriptShadowSend): Promise<void> {
    const cid = encodeURIComponent(operation.conversationId);
    const root = `${this.baseUrl}/sandbox/transcripts/conversations/${cid}`;
    const request = requestFor(root, operation);
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${this.sandboxToken}`,
        ...(request.body ? { "content-type": "application/json" } : {}),
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `transcript shadow failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
  }
}

function requestFor(root: string, operation: TranscriptShadowSend) {
  switch (operation.kind) {
    case "user":
      return transcriptTurnRequest(root, operation);
    case "assistant":
      return transcriptTurnRequest(root, operation);
    case "truncate":
      return {
        method: "POST",
        url: `${root}/truncate`,
        body: { turnId: operation.turnId },
      };
    case "rename":
      return {
        method: "PUT",
        url: root,
        body: { title: operation.title },
      };
    case "delete":
      return { method: "DELETE", url: root };
    case "repair":
      return {
        method: "POST",
        url: `${root}/repair`,
        body: operation.conversation,
      };
  }
}
