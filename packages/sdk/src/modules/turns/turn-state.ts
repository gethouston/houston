import type { PendingInteraction, TokenUsage } from "@houston/runtime-client";
import type {
  FeedOutput,
  SessionStatusValue,
  TerminalBoardStatus,
} from "./feed-output";
import type { FirstResponseClock } from "./first-response";
import type { TurnReplyState } from "./reply-phase";
import { SEND_LOST_MESSAGE, STREAM_LOST_MESSAGE } from "./stream-tuning";
import type { SessionStatusOrigin, TurnErrorClass } from "./turn-error-class";
import {
  type EngineNoticeKind,
  isStoppedByUser,
  TURN_DIED_MESSAGE,
  TURN_FAILED_MESSAGE,
} from "./turn-errors";

export interface TurnState extends TurnReplyState {
  agentPath: string;
  sessionKey: string;
  output: FeedOutput;
  provider: string | null;
  prompt: string | null;
  turnId: string | undefined;
  text: string;
  thinking: string;
  toolsSeen: number;
  toolResultsSeen: number;
  usage: TokenUsage | null;
  settled: boolean;
  terminal: TerminalBoardStatus | null;
  pendingInteraction: PendingInteraction | null;
  delivered: boolean;
  firstResponse?: FirstResponseClock;
  origin: SessionStatusOrigin;
}

export function newTurnState(
  agentPath: string,
  sessionKey: string,
  output: FeedOutput,
  send?: {
    provider?: string;
    prompt?: string;
    firstResponse?: FirstResponseClock;
    board?: TurnReplyState["board"];
    mode?: "turn" | "observer";
  },
): TurnState {
  return {
    agentPath,
    sessionKey,
    output,
    provider: send?.provider ?? null,
    prompt: send?.prompt ?? null,
    turnId: undefined,
    text: "",
    thinking: "",
    toolsSeen: 0,
    toolResultsSeen: 0,
    usage: null,
    settled: false,
    terminal: null,
    pendingInteraction: null,
    delivered: false,
    firstResponse: send?.firstResponse,
    replyComplete: false,
    board: send?.board,
    origin: send?.mode === "observer" ? "observed" : "sent",
  };
}

export function emitStatus(
  s: TurnState,
  status: SessionStatusValue,
  error?: string,
  errorClass?: TurnErrorClass,
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved",
): void {
  s.output.sessionStatus(s.agentPath, s.sessionKey, status, error, {
    origin: s.origin,
    ...(errorClass ? { errorClass } : {}),
    ...(stopReason ? { stopReason } : {}),
  });
}

const NOTICE_CLASS: Record<EngineNoticeKind, TurnErrorClass | null> = {
  engine_restart: "engine_restart",
  engine_resumed: null,
  sandbox_lost: "sandbox_lost",
  turn_time_limit: null,
  turn_time_limit_unsaved: null,
  send_busy: "send_busy",
  compute_busy: "compute_busy",
  agent_too_large: "agent_too_large",
  agent_setup_failed: "agent_setup_failed",
  turn_unconfirmed: "turn_unconfirmed",
};

export function turnErrorClass(
  msg: string,
  notice?: EngineNoticeKind,
): TurnErrorClass {
  if (isStoppedByUser(msg)) return "stopped";
  const byNotice = notice ? NOTICE_CLASS[notice] : null;
  if (byNotice) return byNotice;
  if (msg === TURN_DIED_MESSAGE) return "turn_died";
  if (msg === SEND_LOST_MESSAGE) return "send_lost";
  if (msg === STREAM_LOST_MESSAGE) return "stream_lost";
  if (msg === TURN_FAILED_MESSAGE) return "unexplained";
  return "engine_verdict";
}
