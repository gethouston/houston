import type { ActivityStamp } from "@houston/protocol";
import type { PendingInteraction } from "@houston/runtime-client";
import type { FirstResponse } from "./first-response";
import type { SendWaitReason } from "./send-busy";
import type { SessionStatusDetail } from "./turn-error-class";

export type { PendingInteraction } from "@houston/runtime-client";
export { MultiplexFeedOutput } from "./feed-output-multiplex";

export type SessionStatusValue = "starting" | "running" | "completed" | "error";

export type TerminalBoardStatus = "needs_you" | "error";

export type BoardStatus = "running" | TerminalBoardStatus;

export interface BoardPersistOptions {
  provisional?: boolean;
  stamp?: ActivityStamp;
}

export interface FeedOutput {
  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void;
  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
    error?: string,
    detail?: SessionStatusDetail,
  ): void;
  persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ): Promise<void>;
  confirmIdle?(agentPath: string, sessionKey: string): void;
  stampUserTurn?(agentPath: string, sessionKey: string, turnId: string): void;
  firstResponse?(
    agentPath: string,
    sessionKey: string,
    response: FirstResponse,
  ): void;
  sendWaiting?(
    agentPath: string,
    sessionKey: string,
    reason: SendWaitReason | null,
  ): void;
}
