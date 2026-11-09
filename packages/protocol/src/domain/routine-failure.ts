// Why routine runs fail, and why the engine pauses a routine that keeps failing.

/**
 * Why a routine run failed at the credential level (PRODUCT-1475). A routine
 * fires on its CREATOR's credential scope, so the person reading the run's
 * history may have their own account connected and still see it fail — the run
 * has to name whose account is the problem, and what the remedy is.
 *
 * `creator_*` = the routine creator's own account; `team_*` = the space's
 * single shared account. `out_of_credits` is a VALID credential with no quota
 * left, which reconnecting would not fix. `model_unavailable` = the account
 * works but cannot run the model the routine uses; picking another model fixes
 * it.
 */
export type RoutineAccountFailureCode =
  | "creator_not_connected"
  | "team_not_connected"
  | "creator_needs_reconnect"
  | "team_needs_reconnect"
  | "out_of_credits"
  | "model_unavailable";

/**
 * Every typed reason a routine run failed. `no_model`: the routine names no
 * model (it predates per-routine models, PRODUCT-1982) and the agent has no
 * saved provider to fall back on, so there is no provider to name; choosing a
 * model for the routine fixes it. `usage_limit`: the account's subscription
 * plan used up its usage window (Anthropic's 5-hour session or weekly model
 * limit); it heals by itself at `resets_at`, so it never counts toward an
 * auto-pause and instead snoozes the routine (`Routine.snoozed`).
 */
export type RoutineRunFailureCode =
  | RoutineAccountFailureCode
  | "no_model"
  | "usage_limit";

export type RoutineRunFailure =
  | {
      code: RoutineAccountFailureCode;
      /** The provider id the run needed (e.g. "anthropic"). */
      provider: string;
    }
  | { code: "no_model" }
  | {
      code: "usage_limit";
      /** The provider id whose plan limit the run hit (e.g. "anthropic"). */
      provider: string;
      /** The model the limit applies to, when the turn named one. */
      model: string | null;
      /** ISO 8601 instant the provider said the limit resets; null = unknown. */
      resets_at: string | null;
    };

/**
 * An engine-written hold on a routine's fires that expires by the clock (see
 * `Routine.snoozed`). Unlike `auto_paused` it leaves `enabled` true: the wall
 * clears by itself at `until`, so no one has to resume it and no writer has
 * to clear it (a podless cloud agent has none). Fires whose instant is before
 * `until` are skipped by every scheduler; a change of the routine's model or
 * provider, or a resume, removes it. A stale snooze (its `until` passed) is
 * inert and may be left in place.
 */
export interface RoutineSnooze {
  /** Why: the only reason today is a plan usage window the run used up. */
  reason: "usage_limit";
  /** The provider id whose limit it is (e.g. "anthropic"). */
  provider: string;
  /** The model the limit applies to, when the failed turn named one. */
  model: string | null;
  /** ISO time fires resume: the provider's reset, else a bounded wait. */
  until: string;
  /** ISO time the engine snoozed the routine. */
  at: string;
}

/**
 * Why cloud never started a fire. Delivery failures never contribute to
 * credential auto-pause streaks. `pool_delivery_expired`: no worker took the
 * fire before its deadline; running it again is the remedy.
 * `creator_no_access`: the person the routine runs as can no longer use the
 * agent; any save of the routine (pausing and resuming it included) makes
 * the saver its creator. `agent_data_needs_repair`: the agent's saved data
 * holds two copies of the agent, which only support can repair; running it
 * again fails the same way until then.
 */
export type RoutineDeliveryFailureCode =
  | "pool_delivery_expired"
  | "creator_no_access"
  | "agent_data_needs_repair";

export interface RoutineDeliveryFailure {
  code: RoutineDeliveryFailureCode;
}

/**
 * Why the engine paused a routine (see `Routine.auto_paused`). Every one of the
 * last `failures` runs failed with the same reason, so firing again would only
 * fail again until someone fixes the account or the model it runs on.
 */
export interface RoutineAutoPause {
  /** The failure each of the counted runs hit. */
  reason: RoutineAccountFailureCode;
  /** The provider id those runs needed (e.g. "anthropic"); "" with `cause`. */
  provider: string;
  /**
   * Set when the runs failed on something the account codes cannot name.
   * `no_model`: the routine names no model and nothing is saved to fall back
   * on. Such a pause is written as `reason: "model_unavailable"` with an empty
   * `provider`, because clients older than this field crash on a reason they
   * do not know and the gateway serves this file to every client version; a
   * client that knows `cause` reads it first (PRODUCT-1982).
   */
  cause?: "no_model";
  /** How many runs in a row failed that way. */
  failures: number;
  /** ISO time the engine paused the routine. */
  at: string;
}
