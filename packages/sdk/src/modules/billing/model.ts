import type { OrgBilling } from "@houston/wire-types";

/**
 * The org-plan rules every surface reads, keyed on the active org's
 * {@link OrgBilling}. Only a free org has a weekly pool and routine rules; a
 * paid org, a legacy org (`null`) and an unread list (`undefined`) have none.
 */
type Billing = OrgBilling | null | undefined;

/** How much of a free org's weekly pool is used, as a whole percentage. */
export function usagePercent(billing: Billing): number | null {
  const usage = billing?.tier === "free" ? billing.usage : null;
  if (!usage) return null;
  if (usage.limit <= 0) return 100;
  return Math.min(
    100,
    Math.max(0, Math.floor((usage.used * 100) / usage.limit)),
  );
}

/**
 * The shell dialog to open: resume a free org's paused routines, choose the
 * one it keeps, or the per-person launch announcement (`announcement`, the
 * plan module's `planAnnouncementDue`) when no routine dialog is due.
 */
export function planDialog(
  billing: Billing,
  state: {
    resumeDismissed: boolean;
    keepDismissed: boolean;
    keepRequested: boolean;
    announcement: boolean;
  },
): "resume" | "keep" | "announcement" | null {
  const routines = billing?.tier === "free" ? billing.routines : null;
  if (routines?.paused && !state.resumeDismissed) return "resume";
  if (
    billing?.tier === "free" &&
    (state.keepRequested || (routines?.needsChoice && !state.keepDismissed))
  )
    return "keep";
  return state.announcement ? "announcement" : null;
}

/** The composer's plan line: nothing, the usage hint from 80%, or the limit. */
export function planComposerMode(billing: Billing): "none" | "hint" | "limit" {
  const percent = usagePercent(billing);
  if (percent === null || percent < 80) return "none";
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
 * Refetch at the next instant the org's billing changes on its own: the
 * weekly reset that unblocks the composer, and a scheduled lock. A lock
 * already past is the org's settled state, so it schedules nothing.
 */
export function planLaunchRefreshDelay(
  billing: Billing,
  now: number,
): number | false {
  const lockAt = billing?.lockAt ? Date.parse(billing.lockAt) : Number.NaN;
  const dates = [
    billing?.usage ? Date.parse(billing.usage.resetsAt) : Number.NaN,
    lockAt > now ? lockAt : Number.NaN,
  ].filter(Number.isFinite);
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
