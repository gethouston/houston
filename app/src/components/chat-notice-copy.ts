import type { EngineNoticeKind } from "@houston/sdk";
import type { SystemNoticeKind } from "@houston-ai/chat";

/**
 * The chat's copy for every typed system line, by kind: the same centered
 * note in the person's language, never chosen by the English default text.
 * Keyed on the SDK's whole `EngineNoticeKind`, so a new notice without copy
 * is a compile error here rather than an English line in the chat.
 */
export const NOTICE_COPY = {
  engine_restart: "chat:engineRestart.sayContinue",
  engine_resumed: "chat:engineRestart.resuming",
  turn_time_limit: "chat:replyTimeLimit",
  turn_time_limit_unsaved: "chat:replyTimeLimitUnsaved",
  send_busy: "chat:sendBusy",
  compute_busy: "chat:computeBusy",
  agent_too_large: "chat:agentSetup.tooLarge",
  agent_setup_failed: "chat:agentSetup.failed",
  turn_unconfirmed: "chat:agentSetup.unconfirmed",
} as const satisfies Record<EngineNoticeKind & SystemNoticeKind, string>;

// The chat's notice kinds and the SDK's must stay the same set.
type SameKinds = [EngineNoticeKind] extends [SystemNoticeKind]
  ? [SystemNoticeKind] extends [EngineNoticeKind]
    ? true
    : never
  : never;
export const NOTICE_KINDS_MATCH: SameKinds = true;
