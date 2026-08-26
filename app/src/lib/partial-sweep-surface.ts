/**
 * HOW an incomplete cross-agent sweep is told to the user — the
 * HOUSTON-APP-538 fix.
 *
 * The sweep's recovery policy (lib/all-conversations-recovery.ts) decides WHEN
 * to surface (`PartialSweepSurface`: the first partial sweep of a run, and the
 * once-only escalation when the re-sweeps run out). This module decides WHAT
 * that surface is, from the errors the failed reads actually threw. It used to
 * be unconditionally the error surface, on agent NAMES alone: every partial
 * sweep — including the routine one where an asleep engine pod outlived the
 * transport's cold-start budget (`engine-adapter/cp/transient-retry.ts`) —
 * became a Sentry report, 465 events in twelve days for the gateway working
 * as designed.
 *
 * Pure (its only imports are the two dependency-free failure classifiers) so
 * it unit-tests under node:test; the executor is
 * hooks/queries/all-conversations-sweep.ts.
 */

import { isEngineWakingError } from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";

/**
 * The reason a partial sweep is judged BY: the first real failure if there is
 * one, else the first expected-state failure. One sick pod must not hide
 * behind N waking ones — a mixed sweep classifies (and reports) as its worst
 * member, and only an all-expected sweep earns the quiet surface.
 */
export function representativeSweepFailure(
  failedReasons: readonly unknown[],
): unknown {
  return (
    failedReasons.find(
      (reason) =>
        !isEngineWakingError(reason) && !isNetworkTransportError(reason),
    ) ?? failedReasons[0]
  );
}

/** The surfaces an incomplete sweep can take (the executor maps these onto
 *  `showEngineWakingToast` / `showConnectivityErrorToast` / `showErrorToast`). */
export type PartialSweepToast = "waking" | "connectivity" | "error";

/**
 * Which surface an incomplete sweep earns, at notice AND at escalation.
 *
 * A sweep whose failures are all expected environment states gets the matching
 * quiet informational surface, exactly like every other per-agent call
 * (lib/tauri.ts `surfaceError`): an asleep engine pod still waking is the
 * gateway working as designed (HOU-1114), and the device dropping offline
 * mid-sweep is HOU-1085 — the board keeps painting the carried-forward rows,
 * so nothing in Houston broke and there is nothing to report. Escalation used
 * to override this to the error surface ("a pod that never woke through the
 * whole run is a crashloop"), but the client cannot conclude that
 * (HOUSTON-APP-58Q): the gateway holds a legitimate cold start for minutes and
 * an engine roll restarts busy pods hours into a deploy, so every escalated
 * report was a still-waking pod filed as a bug. Only a real failure — at any
 * point of the run — takes the error surface (toast path + Sentry).
 */
export function partialSweepToastKind(
  representativeReason: unknown,
): PartialSweepToast {
  if (isEngineWakingError(representativeReason)) return "waking";
  if (isNetworkTransportError(representativeReason)) return "connectivity";
  return "error";
}
