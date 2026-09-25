/**
 * Pure first-run routing: which top-level screen a boot lands on. Kept free of
 * React and the host so every gating behavior is unit-tested directly
 * (`app/tests/onboarding-route.test.ts`).
 */

import type { OnboardingPendingStage } from "./onboarding-pending.ts";

/**
 * Whether this boot is a first run that should enter onboarding (HOU-653).
 *
 * The legacy Rust wire signals first-run with ZERO WORKSPACES. The v3 control
 * plane can't: it has no workspace CRUD (single personal workspace,
 * auto-provisioned server-side), so the engine adapter always reports exactly
 * one synthetic workspace and a workspace-count gate never fires. There the
 * honest signal is ZERO AGENTS in that one workspace.
 */
export function isFirstRun(opts: {
  /** New-engine build (v3 host / cloud gateway) vs the legacy Rust wire. */
  controlPlane: boolean;
  workspaceCount: number;
  agentCount: number;
}): boolean {
  return opts.controlPlane ? opts.agentCount === 0 : opts.workspaceCount === 0;
}

/**
 * The first-run onboarding's screens, in order, plus the app itself:
 *
 * - `"survey"` — the onboarding survey (job, industry, automation goal).
 * - `"connectAi"` — the "Connect your AI" card, until a provider is connected.
 * - `"team"` — the "Build your team" card, until the user finishes it.
 * - `"app"` — the workspace shell.
 */
export type OnboardingRoute = "app" | "survey" | "connectAi" | "team";

/** The onboarding screens proper (every route except the app). */
export type OnboardingStep = Exclude<OnboardingRoute, "app">;

export interface OnboardingRouteInputs {
  /** Zero-agent (v3) / zero-workspace (legacy) first-run signal. */
  firstRun: boolean;
  /**
   * How far a first run in progress got (`onboarding_pending`). Hiring the
   * first AI Employee on the team card flips `firstRun` off, so this is what
   * keeps the user on the card until they finish it, and what resumes an
   * onboarding interrupted by a quit.
   */
  pendingStage: OnboardingPendingStage;
  /** This account has finished onboarding before (`onboarding_completed`). */
  onboardingCompleted: boolean;
  /** Deployment lets this user create agents (single-player / owner-admin). */
  canCreateAgents: boolean;
  /** Capability fetch failed: fail closed into the shell, never onboarding. */
  capabilitiesError: boolean;
  /**
   * The survey has resolved with every question answered (or explicitly
   * skipped). It gates on the WHOLE survey: saving one answer flips that
   * question's flag mid-flow, and a per-question gate would route the user out
   * from under the next question.
   */
  surveyAnswered: boolean;
  /** At least one AI provider is confirmed connected by a settled probe. */
  aiConnected: boolean;
}

/**
 * Which top-level screen the first-run gate renders (HOU-732).
 *
 * `firstRun` cannot tell a never-onboarded account from one whose agents were
 * all deleted (or one that finished the cloud-migration wizard with zero cloud
 * agents); `onboardingCompleted` closes that gap, so a completed account with
 * zero agents stays in the app. A pending stage outranks it: onboarding that
 * is mid-flight always resumes where it stands, and a run that reached the
 * team card never goes back to "Connect your AI".
 */
export function onboardingRoute(opts: OnboardingRouteInputs): OnboardingRoute {
  if (!opts.canCreateAgents || opts.capabilitiesError) return "app";
  const inProgress =
    opts.pendingStage !== "none" ||
    (opts.firstRun && !opts.onboardingCompleted);
  if (!inProgress) return "app";
  if (!opts.surveyAnswered) return "survey";
  if (opts.pendingStage === "team" || opts.aiConnected) return "team";
  return "connectAi";
}
