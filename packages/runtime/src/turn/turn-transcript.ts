import { join } from "node:path";
import type { TranscriptTurnWrite } from "@houston/runtime-client";
import { loadConversation } from "../store/conversation-file";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import { putTranscriptRow } from "./turn-transcript-http";
import type { TurnRequest } from "./types";

export type TranscriptPublishResult =
  | { ok: true }
  | { disabled: true; reason: "route_absent" }
  | { fenced: true }
  | { error: string };

export interface TurnTranscript {
  /**
   * Publish the user row as soon as the runtime persisted it (fired on the
   * `user` frame). Idempotent; a failure is remembered and surfaced by the
   * final publish(), never thrown here. This is what lets a gateway that
   * restarts mid-turn rebuild and re-dispatch the turn from the transcript.
   */
  publishUser(): Promise<void>;
  publish(): Promise<TranscriptPublishResult>;
}

export interface TranscriptOptions {
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
  private userPublish: Promise<TranscriptPublishResult> | undefined;

  constructor(private readonly opts: TranscriptOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private load(): {
    conversation?: NonNullable<ReturnType<typeof loadConversation>>;
    error?: string;
  } {
    try {
      const conversation = loadConversation(
        join(this.opts.dataDir, "conversations"),
        this.opts.conversationId,
      );
      return conversation
        ? { conversation }
        : { error: "conversation file is missing" };
    } catch (error) {
      // A corrupt file must still end in a terminal error frame, never a
      // stream that closes with neither done nor error.
      return {
        error: `conversation file unreadable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // A hydrated conversation contains every earlier turn. The persisted turnId
  // identifies the one idempotent pair this claim is allowed to PUT. LAST
  // match: an adopted re-run of this turnId appends a second pair behind the
  // dead worker's, and the reply the client just streamed is the one that
  // must reach Postgres.
  private userIndex(messages: { role: string; turnId?: string }[]): number {
    return messages.findLastIndex(
      (message) =>
        message.role === "user" && message.turnId === this.opts.turnId,
    );
  }

  async publishUser(): Promise<void> {
    this.userPublish ??= (async (): Promise<TranscriptPublishResult> => {
      const loaded = this.load();
      if (!loaded.conversation) return { error: loaded.error ?? "" };
      const index = this.userIndex(loaded.conversation.messages);
      if (index < 0) return { error: "turn user message is missing" };
      return this.put({
        kind: "user",
        turnId: this.opts.turnId,
        message: loaded.conversation.messages[index],
        title: loaded.conversation.title || "",
        expectedCount: index,
      });
    })();
    await this.userPublish;
  }

  async publish(): Promise<TranscriptPublishResult> {
    await this.publishUser();
    const userResult = await this.userPublish;
    if (!userResult || !("ok" in userResult)) {
      return userResult ?? { error: "user row was never published" };
    }
    const loaded = this.load();
    if (!loaded.conversation) return { error: loaded.error ?? "" };
    const conversation = loaded.conversation;
    const userIndex = this.userIndex(conversation.messages);
    if (userIndex < 0) return { error: "turn user message is missing" };

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
    try {
      const response = await putTranscriptRow(this.fetchImpl, this.opts, write);
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
