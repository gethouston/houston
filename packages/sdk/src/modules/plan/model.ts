import { minFireGapMinutes } from "@houston/domain";
import type { PlanSummary } from "@houston/wire-types";

/** The visible usage is always a percentage, including malformed older responses. */
export function usagePercent(plan: PlanSummary | undefined): number | null {
  if (plan?.plan !== "free" || !plan.usage) return null;
  return Math.min(100, Math.max(0, Math.floor(plan.usage.percent)));
}

export function planDialog(
  plan: PlanSummary | undefined,
  resumeDismissed: boolean,
  keepDismissed = false,
  keepRequested = false,
): "resume" | "keep" | "announcement" | null {
  if (plan?.plan !== "free") return null;
  if (plan.routines?.paused && !resumeDismissed) return "resume";
  if (keepRequested || (plan.routines?.needsChoice && !keepDismissed))
    return "keep";
  return plan.announcement ? "announcement" : null;
}

export function planUsageMode(
  plan: PlanSummary | undefined,
  now = Date.now(),
): "none" | "preview" | "current" {
  if (usagePercent(plan) === null) return "none";
  return plan?.limitsStartAt && Date.parse(plan.limitsStartAt) > now
    ? "preview"
    : "current";
}

export function planComposerMode(
  plan: PlanSummary | undefined,
  now = Date.now(),
): "none" | "hint" | "previewHint" | "limit" {
  const percent = usagePercent(plan);
  if (percent === null || percent < 80) return "none";
  if (planUsageMode(plan, now) === "preview") return "previewHint";
  return percent === 100 ? "limit" : "hint";
}

/** setTimeout's ceiling (a signed 32-bit millisecond count). */
const MAX_TIMER_MS = 2_147_483_647;
/**
 * The floor between refetches, so a client clock running ahead of the gateway
 * (the instant already passed here, not there yet) cannot refetch every second.
 */
const MIN_REFRESH_MS = 30_000;

/**
 * Refetch at the next instant the summary changes on its own: the launch, the
 * end of the early offer, and the weekly reset that unblocks the composer.
 */
export function planLaunchRefreshDelay(
  plan: PlanSummary | undefined,
  now: number,
): number | false {
  const dates = [
    plan?.limitsStartAt,
    plan?.plus.offer?.endsAt,
    plan?.usage?.resetsAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (dates.length === 0) return false;
  return Math.min(
    MAX_TIMER_MS,
    Math.max(MIN_REFRESH_MS, Math.min(...dates) - now + 250),
  );
}

export function presenceDue(
  lastReportedAt: number | null,
  now: number,
): boolean {
  return lastReportedAt === null || now - lastReportedAt >= 600_000;
}

/** Cosmetic Free schedule gate; the gateway evaluates real fire times. */
export function freeScheduleAllowed(
  cron: string,
  plan: PlanSummary | undefined,
): boolean {
  if (plan?.plan !== "free") return true;
  const gap = minFireGapMinutes(cron);
  return gap === null || gap >= (plan.routines?.minIntervalMinutes ?? 15);
}
