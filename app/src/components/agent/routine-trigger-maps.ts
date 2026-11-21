import type { Routine, TriggerStatusItem } from "@houston/engine-adapter";

export function triggerBoundRoutineIds(
  routines: Routine[] | null | undefined,
): string[] {
  return (routines ?? []).filter((r) => r.trigger).map((r) => r.id);
}

export function toStatusMap(
  items: TriggerStatusItem[] | null | undefined,
): Record<string, TriggerStatusItem> {
  const out: Record<string, TriggerStatusItem> = {};
  for (const item of items ?? []) out[item.routine_id] = item;
  return out;
}

export function toTriggerSummaries(
  routines: Routine[],
  appName: (toolkit: string) => string,
  render: (app: string) => string,
  webhookLabel: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of routines) {
    const binding = r.trigger;
    if (!binding) continue;
    out[r.id] =
      binding.kind === "webhook"
        ? webhookLabel
        : render(appName(binding.toolkit));
  }
  return out;
}

export const TRIGGER_STATUS_POLL_MS = 15_000;

export const TRIGGER_STATUS_TIMEOUT_MS = 45_000;

export function timedOutTriggerIds(
  triggerRoutineIds: string[],
  items: TriggerStatusItem[] | null | undefined,
  firstSeenAt: Record<string, number>,
  now: number,
  timeoutMs: number = TRIGGER_STATUS_TIMEOUT_MS,
): string[] {
  const known = new Set((items ?? []).map((i) => i.routine_id));
  return triggerRoutineIds.filter((id) => {
    if (known.has(id)) return false;
    const since = firstSeenAt[id];
    return since !== undefined && now - since >= timeoutMs;
  });
}

export function withTriggerTimeouts(
  base: Record<string, TriggerStatusItem>,
  timedOutIds: string[],
  detail: string,
): Record<string, TriggerStatusItem> {
  if (timedOutIds.length === 0) return base;
  const out = { ...base };
  for (const id of timedOutIds) {
    out[id] = { routine_id: id, status: "error", detail };
  }
  return out;
}

export function triggerStatusPollInterval(
  triggerRoutineIds: string[],
  items: TriggerStatusItem[] | null | undefined,
): number | false {
  if (triggerRoutineIds.length === 0) return false;
  const byId = new Map((items ?? []).map((i) => [i.routine_id, i.status]));
  const settling = triggerRoutineIds.some((id) => {
    const s = byId.get(id);
    return s === undefined || s === "pending" || s === "error";
  });
  return settling ? TRIGGER_STATUS_POLL_MS : false;
}

export type TriggerActivationKind =
  | "checking"
  | "activating"
  | "active"
  | "alert";

export function triggerActivationKind(
  status: TriggerStatusItem | undefined,
): TriggerActivationKind {
  switch (status?.status) {
    case undefined:
      return "checking";
    case "pending":
      return "activating";
    case "active":
      return "active";
    default:
      return "alert";
  }
}

export type WebhookActivationState =
  | "checking"
  | "needs_key"
  | "active"
  | "alert";

export function webhookActivationState(
  status: TriggerStatusItem | undefined,
): WebhookActivationState {
  switch (status?.status) {
    case undefined:
      return "checking";
    case "pending":
      return "needs_key";
    case "active":
      return "active";
    default:
      return "alert";
  }
}
