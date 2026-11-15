// An AI Employee's first day: the setup task where it introduces itself and
// interviews the user (`POST /agents/:agentId/first-day`).

import type { AgentArrival } from "./config";

/** What the surface that starts a first day supplies. Both are optional. */
export interface FirstDayStartInput {
  /**
   * The user's app language (`"es"`, `"pt-BR"`): the whole first conversation
   * is held in it. Absent, English.
   */
  locale?: string;
  /** The setup task's board title, in the user's language. Absent, English. */
  title?: string;
}

/**
 * `started`: this call recorded the start. It fired the setup task's first
 * turn, creating the task unless an unrecorded earlier start left it behind,
 * or found that earlier start's turn still running.
 * `existing`: the start was already recorded, and nothing new started.
 */
export type FirstDayOutcome = "started" | "existing";

export interface FirstDayStartResult {
  outcome: FirstDayOutcome;
  mission: {
    id: string;
    /** The conversation the setup task's chat lives in. */
    sessionKey: string;
    title: string;
  };
  /** The job the hello names, off the employee's job description; `null` without one. */
  role: string | null;
  /** How the employee joined, when its hire recorded it. */
  arrival?: AgentArrival;
}

/** Why a first day would not start: the host answers each with a 409. */
export type FirstDayRefusalCode =
  /** Not a pending new hire, and no setup task to hand back. */
  | "first_day_not_pending"
  /** The setup task's first turn could not be started; the first day stays pending. */
  | "first_day_not_started"
  /**
   * The person has no AI connected for the first turn to run on (the
   * runtime's `no_provider`, the gateway's provider-not-connected refusal).
   * An expected state, not a failure: the first day stays pending and
   * starts once an AI is connected.
   */
  | "first_day_no_provider"
  /**
   * The person's AI is connected but its credential could not be served for
   * the first turn right now (the provider failed a token refresh, or the
   * lookup timed out). Transient: the first day stays pending, and the
   * answer carries `Retry-After` for when another start may succeed.
   */
  | "first_day_provider_unavailable";

/** The 409 body a refused first-day start answers with. */
export interface FirstDayRefusal {
  code: FirstDayRefusalCode;
  error: string;
  /** `first_day_no_provider` only: the pinned provider that is not connected. */
  provider?: string;
}
