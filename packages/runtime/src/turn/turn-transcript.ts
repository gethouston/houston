import { join } from "node:path";
import {
  type TranscriptTurnWrite,
  transcriptTurnRequest,
} from "@houston/runtime-client";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import { loadConversation } from "../store/conversation-file";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

const REQUEST_TIMEOUT_MS = 5_000;

export type TranscriptPublishResult =
  | { ok: true }
  | { disabled: true; reason: "route_absent" }
  | { fenced: true }
  | { error: string };

export interface TurnTranscript {
  publish(): Promise<TranscriptPublishResult>;
}

interface TranscriptOptions {
  baseUrl: string;
  org: string;
  agent: string;
  conversationId: string;
  turnId: string;
  dataDir: string;
  hostToken: string;
  claim: { token: string; bootId: string };
  fetchImpl?: typeof fetch;
  /** Test seam: shrink the transient-status retry delays. */
  retryDelaysMs?: number[];
}

class HttpTurnTranscript implements TurnTranscript {
  private readonly fetchImpl: typeof fetch;
  private disabled = false;
  private landed = 0;

  constructor(private readonly opts: TranscriptOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publish(): Promise<TranscriptPublishResult> {
    let conversation: ReturnType<typeof loadConversation>;
    try {
      conversation = loadConversation(
        join(this.opts.dataDir, "conversations"),
        this.opts.conversationId,
      );
    } catch (error) {
      // A corrupt file must still end in a terminal error frame, never a
      // stream that closes with neither done nor error.
      return {
        error: `conversation file unreadable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!conversation) return { error: "conversation file is missing" };
    // A hydrated conversation contains every earlier turn. The persisted
    // turnId identifies the one idempotent pair this claim is allowed to PUT.
    // LAST match: an adopted re-run of this turnId appends a second pair
    // behind the dead worker's, and the reply the client just streamed is
    // the one that must reach Postgres.
    const userIndex = conversation.messages.findLastIndex(
      (message) =>
        message.role === "user" && message.turnId === this.opts.turnId,
    );
    if (userIndex < 0) return { error: "turn user message is missing" };
    const userResult = await this.put({
      kind: "user",
      turnId: this.opts.turnId,
      message: conversation.messages[userIndex],
      title: conversation.title || "",
      expectedCount: userIndex,
    });
    if (!("ok" in userResult)) return userResult;

    const assistant = conversation.messages
      .slice(userIndex + 1)
      .find(
        (message) =>
          message.role === "assistant" && message.turnId === this.opts.turnId,
      );
    return assistant
      ? this.put({
          kind: "assistant",
          turnId: this.opts.turnId,
          message: assistant,
        })
      : ({ ok: true } as const);
  }

  private async put(
    write: TranscriptTurnWrite,
  ): Promise<TranscriptPublishResult> {
    if (this.disabled) return { disabled: true, reason: "route_absent" };
    const root = this.opts.baseUrl.replace(/\/+$/, "");
    const conversationUrl = `${root}/v1/pod/transcripts/${encodeURIComponent(
      this.opts.org,
    )}/${encodeURIComponent(this.opts.agent)}/conversations/${encodeURIComponent(
      this.opts.conversationId,
    )}`;
    const request = transcriptTurnRequest(conversationUrl, write);
    try {
      // Transient 502/503/504 and network drops retry (the routes are
      // idempotent per turnId); a fresh timeout per attempt, or a timed-out
      // signal would abort every retry on arrival.
      const response = await fetchWithRetry(
        (url, init) =>
          this.fetchImpl(url, {
            ...init,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
        request.url,
        {
          method: request.method,
          headers: {
            Authorization: `Bearer ${this.opts.hostToken}`,
            "Content-Type": "application/json",
            "X-Houston-Claim-Token": this.opts.claim.token,
            "X-Houston-Claim-Boot": this.opts.claim.bootId,
          },
          body: JSON.stringify(request.body),
        },
        this.opts.retryDelaysMs ? { delaysMs: this.opts.retryDelaysMs } : {},
      );
      // Release the socket whatever the status; the body is never needed.
      await response.body?.cancel();
      if (response.ok) {
        this.landed += 1;
        return { ok: true };
      }
      if (response.status === 404 && this.landed === 0) {
        // Older deployments may lack transcript routes: the FIRST PUT is the
        // probe. Once a row has landed the routes exist, so a later 404 is a
        // real miss (conversation gone) and must fail the publish below.
        // Loud: a whole fleet silently publishing nothing would otherwise be
        // invisible until the history fallback found empty tables.
        console.warn(
          `[turn] transcript routes absent at the pool store; skipping publish for ${this.opts.org}/${this.opts.agent}/${this.opts.conversationId}`,
        );
        this.disabled = true;
        return { disabled: true, reason: "route_absent" };
      }
      if (response.status === 409) return { fenced: true };
      // Status only: response bodies are an HTTP seam, and this string ends
      // up on the terminal frame and in the turn log.
      return { error: `${write.kind} row rejected (${response.status})` };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Create a claim-authorized transcript publisher for one real pool turn. */
export function createTurnTranscript(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  filesystem: TurnFilesystem,
): TurnTranscript | null {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (turn.shadow || !baseUrl || !turn.claim || !turn.hostToken) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return new HttpTurnTranscript({
    baseUrl,
    org,
    agent,
    conversationId: turn.conversationId,
    turnId: turn.turnId,
    dataDir: filesystem.dataDir,
    hostToken: turn.hostToken,
    claim: { token: turn.claim.token, bootId: turn.claim.bootId },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.transcriptRetryDelaysMs
      ? { retryDelaysMs: deps.transcriptRetryDelaysMs }
      : {}),
  });
}
