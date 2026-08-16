import type { ChatMessage } from "@houston/protocol";
import {
  capturePodFence,
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";
import { parseReplyAfter } from "./reply-wire";

export type TranscriptShadowCommand =
  | {
      kind: "user";
      conversationId: string;
      turnId: string;
      message: ChatMessage;
      title: string;
      expectedCount: number;
    }
  | {
      kind: "assistant";
      conversationId: string;
      turnId: string;
      message: ChatMessage;
    }
  | { kind: "truncate"; conversationId: string; turnId: string }
  | {
      kind: "rename";
      conversationId: string;
      title: string;
    }
  | { kind: "delete"; conversationId: string }
  | { kind: "repair"; conversationId: string; conversation: unknown };

export interface TranscriptShadow {
  apply(command: TranscriptShadowCommand): Promise<void>;
  /** undefined means the route is unavailable and the file reader must be used. */
  replyAfter(
    conversationId: string,
    sinceMs: number,
  ): Promise<ChatMessage | null | undefined>;
}

export class HttpTranscriptShadow implements TranscriptShadow {
  private readonly fetchImpl: typeof fetch;
  private readonly revisions = new Map<string, number>();
  private disabled = false;

  constructor(
    private readonly opts: {
      gateway: PodGatewayConfig;
      fetchImpl?: typeof fetch;
    },
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async apply(command: TranscriptShadowCommand): Promise<void> {
    if (this.disabled) return;
    const request = this.requestFor(command);
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: podGatewayHeaders(this.opts.gateway, {
        write: true,
        json: request.body !== undefined,
      }),
      ...(request.body !== undefined
        ? { body: JSON.stringify(request.body) }
        : {}),
      signal: AbortSignal.timeout(5_000),
    });
    capturePodFence(this.opts.gateway, response);
    if (response.status === 404) return this.disableForSkew();
    if (!response.ok) throw await responseError(response, command.kind);
    const revision = await responseRevision(response);
    if (revision !== undefined) {
      this.revisions.set(command.conversationId, revision);
    }
  }

  async replyAfter(
    conversationId: string,
    sinceMs: number,
  ): Promise<ChatMessage | null | undefined> {
    if (this.disabled) return undefined;
    const response = await this.fetchImpl(
      `${this.conversationUrl(conversationId)}/reply-after?since=${encodeURIComponent(String(sinceMs))}`,
      {
        headers: podGatewayHeaders(this.opts.gateway),
        signal: AbortSignal.timeout(5_000),
      },
    );
    capturePodFence(this.opts.gateway, response);
    if (response.status === 404) {
      this.disableForSkew();
      return undefined;
    }
    if (!response.ok) throw await responseError(response, "reply-after");
    return parseReplyAfter(await response.json());
  }

  private requestFor(command: TranscriptShadowCommand) {
    const root = this.conversationUrl(command.conversationId);
    switch (command.kind) {
      case "user":
        return {
          method: "PUT",
          url: `${root}/turns/${encodeURIComponent(command.turnId)}/user`,
          body: {
            message: command.message,
            ts: command.message.ts,
            title: command.title,
            expectedCount: command.expectedCount,
            // No replay marker on the wire: the strict pod route derives and
            // records `needs_session_replay` itself (set on truncate, cleared
            // by the next user turn), and its parser rejects unknown fields.
          },
        };
      case "assistant":
        return {
          method: "PUT",
          url: `${root}/turns/${encodeURIComponent(command.turnId)}/assistant`,
          body: { message: command.message, ts: command.message.ts },
        };
      case "truncate":
        return {
          method: "POST",
          url: `${root}/truncate`,
          body: {
            turnId: command.turnId,
            expectedRevision: this.revisions.get(command.conversationId) ?? 0,
          },
        };
      case "rename":
        return {
          method: "PUT",
          url: root,
          body: { title: command.title },
        };
      case "delete":
        return { method: "DELETE", url: root };
      case "repair":
        return {
          method: "POST",
          url: `${root}/repair`,
          body: command.conversation,
        };
    }
  }

  private conversationUrl(conversationId: string): string {
    const { gateway } = this.opts;
    return podGatewayUrl(
      gateway,
      `/v1/pod/transcripts/${encodeURIComponent(gateway.orgSlug)}/${encodeURIComponent(gateway.agentSlug)}/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  private disableForSkew(): void {
    if (this.disabled) return;
    this.disabled = true;
    console.debug(
      "[transcript-shadow] gateway route unavailable; disabling for this process",
    );
  }
}

async function responseRevision(
  response: Response,
): Promise<number | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as { revision?: unknown };
    return typeof body.revision === "number" ? body.revision : undefined;
  } catch (error) {
    console.debug("[transcript-shadow] response carried no revision", error);
    return undefined;
  }
}

async function responseError(
  response: Response,
  operation: string,
): Promise<Error> {
  const detail = await response.text();
  return new Error(
    `transcript ${operation} failed (${response.status}): ${detail.slice(0, 300)}`,
  );
}
