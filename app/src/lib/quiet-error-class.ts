import { isFirstDayNoProvider } from "@houston/sdk/agents/first-day-refusal";
import {
  isComputeBusyRefusal,
  isConversationEditRefused,
  isPodWakeRefused,
} from "@houston/sdk/compute-quiet";
import { isUploadInterruptedError } from "@houston/sdk/files/upload-interrupted";
import { bridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";
import type { QuietErrorClass } from "@houston/sdk/quiet-error-class";
import { isPlanMinIntervalRefusal } from "@houston/sdk/routines/plan-floor-quiet";
import { isRoutineGone } from "@houston/sdk/routines/routine-gone";
import { isWebhookKeyNotCreatorRefusal } from "@houston/sdk/routines/webhook-key-access";
import { isBugIntakeUnavailable } from "./bug-report-failure.ts";
import { isEngineWakingError } from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";
import { isNoBrowserFailure } from "./url-open-failure.ts";

export type { QuietErrorClass } from "@houston/sdk/quiet-error-class";

export function classifyQuietError(err: unknown): QuietErrorClass | null {
  if (isNoBrowserFailure(err)) return "no_url_handler";
  if (isPlanMinIntervalRefusal(err)) return "plan_min_interval";
  if (isWebhookKeyNotCreatorRefusal(err)) return "webhook_not_creator";
  if (isRoutineGone(err)) return "routine_gone";
  if (isFirstDayNoProvider(err)) return "first_day_no_provider";
  if (isBugIntakeUnavailable(err)) return "bug_intake_unavailable";
  const bridge = bridgeQuietClass(err);
  if (bridge) return bridge;
  if (isComputeBusyRefusal(err)) return "compute_busy";
  if (isConversationEditRefused(err)) return "conversation_edit_refused";
  if (isPodWakeRefused(err)) return null;
  if (isEngineWakingError(err)) return "engine_waking";
  if (isUploadInterruptedError(err)) return "upload_interrupted";
  if (isNetworkTransportError(err)) return "offline";
  return null;
}

export interface QuietErrorDetails {
  status: number | null;
  body: string | null;
}

export function quietErrorDetails(err: unknown): QuietErrorDetails {
  if (!(err instanceof Error)) return { status: null, body: null };
  const status = (err as { status?: unknown }).status;
  const body = (err as { body?: unknown }).body;
  const rawBody =
    typeof body === "string"
      ? body
      : body instanceof Error
        ? body.message
        : body !== null && body !== undefined
          ? JSON.stringify(body)
          : err.message;
  return {
    status: typeof status === "number" && status > 0 ? status : null,
    body: rawBody,
  };
}

export function agentKeyOf(
  err: unknown,
  context?: Record<string, unknown>,
): string | null {
  const stamped = (err as { agentId?: unknown } | null)?.agentId;
  if (typeof stamped === "string" && stamped) return stamped;
  for (const key of ["agentId", "agentPath"]) {
    const value = context?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
