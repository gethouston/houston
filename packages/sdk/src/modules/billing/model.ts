import type { OrgBilling } from "@houston/wire-types";

type Billing = OrgBilling | null | undefined;

export function usagePercent(billing: Billing): number | null {
  const usage = billing?.tier === "free" ? billing.usage : null;
  if (!usage) return null;
  if (usage.limit <= 0) return 100;
  return Math.min(
    100,
    Math.max(0, Math.floor((usage.used * 100) / usage.limit)),
  );
}

export function planDialog(
  billing: Billing,
  state: {
    resumeDismissed: boolean;
    keepDismissed: boolean;
    keepRequested: boolean;
    announcement: boolean;
  },
): "resume" | "keep" | "announcement" | null {
  const routineRules = billing?.tier === "free" && billing.status !== "locked";
  const routines = routineRules ? billing.routines : null;
  if (routines?.paused && !state.resumeDismissed) return "resume";
  if (
    routineRules &&
    (state.keepRequested || (routines?.needsChoice && !state.keepDismissed))
  )
    return "keep";
  return state.announcement ? "announcement" : null;
}

export function planComposerMode(billing: Billing): "none" | "hint" | "limit" {
  const percent = usagePercent(billing);
  if (percent === null || percent < 80) return "none";
  return percent === 100 ? "limit" : "hint";
}

const MAX_TIMER_MS = 2_147_483_647;
const MIN_REFRESH_MS = 30_000;

export function planLaunchRefreshDelay(
  billing: Billing,
  now: number,
): number | false {
  const lockAt =
    billing?.lockAt && billing.status !== "locked"
      ? Date.parse(billing.lockAt)
      : Number.NaN;
  const dates = [
    billing?.usage ? Date.parse(billing.usage.resetsAt) : Number.NaN,
    lockAt,
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
