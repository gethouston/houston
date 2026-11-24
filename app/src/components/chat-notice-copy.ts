import type { EngineNoticeKind } from "@houston/sdk";
import type { SystemNoticeKind } from "@houston-ai/chat";

export const NOTICE_COPY = {
  engine_restart: "chat:engineRestart.sayContinue",
  engine_resumed: "chat:engineRestart.resuming",
  sandbox_lost: "chat:sandboxLost",
  turn_time_limit: "chat:replyTimeLimit",
  turn_time_limit_unsaved: "chat:replyTimeLimitUnsaved",
  send_busy: "chat:sendBusy",
  compute_busy: "chat:computeBusy",
  agent_too_large: "chat:agentSetup.tooLarge",
  agent_setup_failed: "chat:agentSetup.failed",
  turn_unconfirmed: "chat:agentSetup.unconfirmed",
} as const satisfies Record<EngineNoticeKind & SystemNoticeKind, string>;

type SameKinds = [EngineNoticeKind] extends [SystemNoticeKind]
  ? [SystemNoticeKind] extends [EngineNoticeKind]
    ? true
    : never
  : never;
export const NOTICE_KINDS_MATCH: SameKinds = true;
