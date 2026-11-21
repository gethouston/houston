import type {
  FreeOrg,
  MessageLimitScope,
  OrgBilling,
  PlanRoutine,
  PlanRoutineKey,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";

export const FAKE_CHECKOUT_URL = "https://checkout.houston.invalid/c/pay/e2e";
export const FAKE_PORTAL_URL = "https://billing.houston.invalid/p/session/e2e";

export interface PlanMessageLimit {
  limit: number;
  resetsAt: string;
  scope?: MessageLimitScope;
}

export interface PlanSeed {
  summary: PlanSummary;
  invoices?: PlusInvoice[];
  routines?: PlanRoutine[];
  checkoutUrl?: string;
  portalUrl?: string;
  messageLimit?: PlanMessageLimit | null;
  checkoutRefusal?: PlanCheckoutRefusal | null;
  freeOrg?: FreeOrg | null;
  personalBilling?: OrgBilling | null;
}

export type PlanCheckoutRefusal = "account_deleted" | "not_configured";

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
  | "send"
  | "org_free"
  | "switch_to_yearly"
  | "price_notice_dismiss";

export interface PlanCall {
  route: PlanCallRoute;
  body?: unknown;
}

interface PlanWorld {
  seed: Required<PlanSeed> | null;
  calls: PlanCall[];
}

let world: PlanWorld = { seed: null, calls: [] };

export function resetPlan(): void {
  world = { seed: null, calls: [] };
}

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
          freeOrg: seed.freeOrg ?? null,
          personalBilling: structuredClone(seed.personalBilling ?? null),
        }
      : null,
    calls: [],
  };
  return world.seed;
}

export function planSeed(): Required<PlanSeed> | null {
  return world.seed;
}

export function recordPlanCall(route: PlanCallRoute, body?: unknown): void {
  world.calls.push(body === undefined ? { route } : { route, body });
}

export function planCalls(): PlanCall[] {
  return world.calls;
}

export function dismissAnnouncement(seed: Required<PlanSeed>): void {
  seed.summary.announcement = false;
}

export function resumePlanRoutines(seed: Required<PlanSeed>): PlanSummary {
  if (seed.summary.routines) seed.summary.routines.paused = false;
  return seed.summary;
}

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
