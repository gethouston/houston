import type { PendingInteraction } from "@houston/runtime-client";
import type {
  BoardPersistOptions,
  BoardStatus,
  FeedOutput,
  SessionStatusValue,
} from "./feed-output";
import type { FirstResponse } from "./first-response";
import type { SendWaitReason } from "./send-busy";
import type { SessionStatusDetail } from "./turn-error-class";

/**
 * Fan every push out to several {@link FeedOutput}s at once. The turn machinery
 * folds each frame ONCE and calls a single output; wrapping N outputs in one
 * multiplexer runs them all with no re-processing — e.g. the SDK's conversation
 * VM plus a host's own sink. `persistBoardStatus` awaits every child.
 */
export class MultiplexFeedOutput implements FeedOutput {
  constructor(private readonly outputs: readonly FeedOutput[]) {}

  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void {
    for (const o of this.outputs) o.pushFeedItem(agentPath, sessionKey, item);
  }

  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
    error?: string,
    detail?: SessionStatusDetail,
  ): void {
    for (const o of this.outputs)
      o.sessionStatus(agentPath, sessionKey, status, error, detail);
  }

  async persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ): Promise<void> {
    await Promise.all(
      this.outputs.map((o) =>
        o.persistBoardStatus(
          agentPath,
          sessionKey,
          status,
          pendingInteraction,
          opts,
        ),
      ),
    );
  }

  confirmIdle(agentPath: string, sessionKey: string): void {
    for (const o of this.outputs) o.confirmIdle?.(agentPath, sessionKey);
  }

  stampUserTurn(agentPath: string, sessionKey: string, turnId: string): void {
    for (const o of this.outputs)
      o.stampUserTurn?.(agentPath, sessionKey, turnId);
  }

  firstResponse(
    agentPath: string,
    sessionKey: string,
    response: FirstResponse,
  ): void {
    for (const o of this.outputs)
      o.firstResponse?.(agentPath, sessionKey, response);
  }

  sendWaiting(
    agentPath: string,
    sessionKey: string,
    reason: SendWaitReason | null,
  ): void {
    for (const o of this.outputs)
      o.sendWaiting?.(agentPath, sessionKey, reason);
  }
}
