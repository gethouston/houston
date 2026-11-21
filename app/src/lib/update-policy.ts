import type { UpdateStatus } from "./update-status";

export type CheckOrigin = "launch" | "poll";

export type UpdateOrigin = CheckOrigin | "return";

export type UpdatePresentation = "launch" | "background";

export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const FOCUS_RECHECK_MIN_GAP_MS = 60 * 1000;

export function updatePresentation(
  status: Exclude<UpdateStatus, { state: "idle" }>,
): UpdatePresentation {
  if (status.info.origin === "poll") return "background";
  if (status.info.origin === "return" && status.state === "error") {
    return "background";
  }
  return "launch";
}

export function shouldRecheckOnFocus(
  lastCheckAt: number | null,
  now: number,
): boolean {
  return lastCheckAt === null || now - lastCheckAt >= FOCUS_RECHECK_MIN_GAP_MS;
}

export type UpdateCheckOutcome = "found" | "none" | "failed" | "skipped";

export const UPDATE_CHECK_STUCK_THRESHOLD = 3;

export function nextCheckFailureStreak(
  streak: number,
  outcome: UpdateCheckOutcome,
): number {
  if (outcome === "failed") return streak + 1;
  if (outcome === "skipped") return streak;
  return 0;
}

export function updateCheckJustStuck(streak: number): boolean {
  return streak === UPDATE_CHECK_STUCK_THRESHOLD;
}

export function shouldReportDownloadFailure(
  reportedVersion: string | null,
  version: string,
): boolean {
  return reportedVersion !== version;
}

export const LAUNCH_DOWNLOAD_ATTEMPTS = 2;
export const POLL_DOWNLOAD_ATTEMPTS = 5;

export function downloadAttemptBudget(origin: UpdateOrigin): number {
  return origin === "poll" ? POLL_DOWNLOAD_ATTEMPTS : LAUNCH_DOWNLOAD_ATTEMPTS;
}

export type DownloadTrigger = CheckOrigin | "user";

export function shouldSkipDownload(
  gaveUpVersion: string | null,
  version: string,
  trigger: DownloadTrigger,
): boolean {
  if (trigger === "user") return false;
  return gaveUpVersion === version;
}
