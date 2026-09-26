/**
 * The C19 personal plan a spec arms (`/__test__/plan`): the `PlanSummary` the
 * gateway would compute, the person's invoices and routines, the Stripe URLs a
 * checkout or portal hands back, and the weekly message limit a chat send hits.
 *
 * Disarmed (the seed) is the gateway with the plan OFF: no capability, and
 * every plan route answers `503 not_configured`, so every spec that never arms
 * it runs exactly as before. The routes mutate the armed summary the way the
 * gateway's store would (a dismissed announcement stays dismissed, a resume
 * clears the pause), and every call lands in a ledger a spec reads back to
 * assert "called exactly once" instead of trusting the UI's word for it.
 */

import type {
  PlanRoutine,
  PlanRoutineKey,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";

/** Never a real Stripe host: a spec stubs `window.open`, and a leak goes nowhere. */
export const FAKE_CHECKOUT_URL = "https://checkout.houston.invalid/c/pay/e2e";
export const FAKE_PORTAL_URL = "https://billing.houston.invalid/p/session/e2e";

/** The C19 refusal a chat send answers while armed (`429 message_limit`). */
export interface PlanMessageLimit {
  limit: number;
  resetsAt: string;
}

/** What `/__test__/plan` takes. Only `summary` is required. */
export interface PlanSeed {
  summary: PlanSummary;
  invoices?: PlusInvoice[];
  routines?: PlanRoutine[];
  checkoutUrl?: string;
  portalUrl?: string;
  messageLimit?: PlanMessageLimit | null;
  /** A C19 refusal every Plus checkout answers instead of a session. */
  checkoutRefusal?: PlanCheckoutRefusal | null;
}

/** The checkout refusals a spec can arm (`already_plus` follows the summary). */
export type PlanCheckoutRefusal = "account_deleted" | "not_configured";

/** Every route the ledger names: the plan surface plus a refused chat send. */
export type PlanCallRoute =
  | "plan"
  | "invoices"
  | "routines"
  | "checkout"
  | "portal"
  | "keep"
  | "resume"
  | "presence"
  | "announcement"
  | "send";

export interface PlanCall {
  route: PlanCallRoute;
  body?: unknown;
}

interface PlanWorld {
  seed: Required<PlanSeed> | null;
  calls: PlanCall[];
}

let world: PlanWorld = { seed: null, calls: [] };

/** Disarm the plan and clear the ledger. Called by `reset()` before each test. */
export function resetPlan(): void {
  world = { seed: null, calls: [] };
}

/**
 * Arm (or, with `null`, disarm) the plan. Arming replaces the whole world and
 * clears the ledger, so what a spec reads back is only what its own UI did.
 * The caller pairs this with the `plan` capability (the router does).
 */
export function armPlan(seed: PlanSeed | null): Required<PlanSeed> | null {
  world = {
    seed: seed
      ? {
          summary: structuredClone(seed.summary),
          invoices: structuredClone(seed.invoices ?? []),
          routines: structuredClone(seed.routines ?? []),
          checkoutUrl: seed.checkoutUrl ?? FAKE_CHECKOUT_URL,
          portalUrl: seed.portalUrl ?? FAKE_PORTAL_URL,
          messageLimit: seed.messageLimit ?? null,
          checkoutRefusal: seed.checkoutRefusal ?? null,
        }
      : null,
    calls: [],
  };
  return world.seed;
}

/** The armed world, or `null` while the plan is off. */
export function planSeed(): Required<PlanSeed> | null {
  return world.seed;
}

export function recordPlanCall(route: PlanCallRoute, body?: unknown): void {
  world.calls.push(body === undefined ? { route } : { route, body });
}

export function planCalls(): PlanCall[] {
  return world.calls;
}

/** `POST /v1/me/plan/announcement`: dismissed for good, across reloads. */
export function dismissAnnouncement(seed: Required<PlanSeed>): void {
  seed.summary.announcement = false;
}

/** `POST /v1/me/routines/resume`: clear the inactivity pause. */
export function resumePlanRoutines(seed: Required<PlanSeed>): PlanSummary {
  if (seed.summary.routines) seed.summary.routines.paused = false;
  return seed.summary;
}

/**
 * `PUT /v1/me/routines/keep`: record the person's choice, or `null` when the
 * triple is not one of their routines (the gateway's `404 routine_not_found`).
 */
export function keepPlanRoutine(
  seed: Required<PlanSeed>,
  key: PlanRoutineKey,
): PlanSummary | null {
  const same = (r: PlanRoutineKey) =>
    r.orgSlug === key.orgSlug &&
    r.agentSlug === key.agentSlug &&
    r.routineId === key.routineId;
  if (!seed.routines.some(same)) return null;
  for (const routine of seed.routines) routine.kept = same(routine);
  if (seed.summary.routines) {
    seed.summary.routines.kept = {
      orgSlug: key.orgSlug,
      agentSlug: key.agentSlug,
      routineId: key.routineId,
    };
    seed.summary.routines.needsChoice = false;
  }
  return seed.summary;
}
