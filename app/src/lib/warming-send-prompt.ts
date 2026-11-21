import type { ActivityStatus, MessageMention } from "@houston/engine-adapter";
import type { PendingWarmingSend } from "./agent-provisioning/entry";

export interface WarmingSendInput {
  sessionKey: string;
  text: string;
  prompt?: string;
  row?: PendingWarmingSend["row"];
  provider?: string;
  model?: string;
  effort?: string;
  mode?: PendingWarmingSend["mode"];
  mentions?: MessageMention[];
  grants?: PendingWarmingSend["grants"];
  titleText?: string;
  rowOnly?: boolean;
}

export function warmingSendRecord(input: WarmingSendInput): PendingWarmingSend {
  return {
    id: crypto.randomUUID(),
    sessionKey: input.sessionKey,
    text: input.text,
    prompt: input.prompt,
    row: input.row,
    provider: input.provider,
    model: input.model,
    effort: input.effort,
    mode: input.mode,
    mentions: input.mentions,
    grants: input.grants,
    queuedAt: Date.now(),
    titleText: input.titleText,
    rowOnly: input.rowOnly,
  };
}

export type WarmingPromptSource = "builder" | "persisted" | "text";

export interface WarmingPromptChoice {
  prompt: string;
  source: WarmingPromptSource;
}

export function chooseWarmingPrompt(
  send: Pick<PendingWarmingSend, "text" | "prompt">,
  built: string | undefined,
): WarmingPromptChoice | null {
  if (built) return { prompt: built, source: "builder" };
  if (send.prompt) return { prompt: send.prompt, source: "persisted" };
  if (send.text) return { prompt: send.text, source: "text" };
  return null;
}

export interface UndeliverableSend {
  reason: string;
  settleRow: { id: string; status: ActivityStatus } | null;
}

export function undeliverableSend(
  send: Pick<PendingWarmingSend, "sessionKey">,
  rowId: string | null,
): UndeliverableSend {
  return {
    reason: `queued send has no prompt to deliver (session ${send.sessionKey})`,
    settleRow: rowId ? { id: rowId, status: "needs_you" } : null,
  };
}
