import { join } from "node:path";
import type { TranscriptTurnWrite } from "@houston/runtime-client";
import { loadConversation } from "../store/conversation-file";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { turnIsUnconnected } from "./turn-request";
import { poolIdentity } from "./turn-store";
import { putTranscriptRow } from "./turn-transcript-http";
import { turnRow } from "./turn-transcript-row";
import type { TurnRequest } from "./types";

export type TranscriptPublishResult =
  | { ok: true }
  | { disabled: true; reason: "route_absent" }
  | { fenced: true }
  | { error: string };

export interface TurnTranscript {
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
      return {
        error: `conversation file unreadable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

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

    const assistant = turnRow(
      conversation.messages.slice(userIndex + 1),
      this.opts.turnId,
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
        console.warn(
          `[turn] transcript routes absent at the pool store; skipping publish for ${this.opts.org}/${this.opts.agent}/${this.opts.conversationId}`,
        );
        this.disabled = true;
        return { disabled: true, reason: "route_absent" };
      }
      if (response.status === 409) return { fenced: true };
      return { error: `${write.kind} row rejected (${response.status})` };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function createTurnTranscript(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  filesystem: TurnFilesystem,
): TurnTranscript | null {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (turn.shadow || turnIsUnconnected(turn)) return null;
  if (!baseUrl || !turn.claim || !turn.hostToken) return null;
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
