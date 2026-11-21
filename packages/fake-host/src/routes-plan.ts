import type { PlanRoutineKey } from "@houston/wire-types";
import { CORS, json, noContent } from "./http";
import * as state from "./state";

const refuse = (status: number, code: string, error: string): Response =>
  json({ error, code }, status);

const CHECKOUT_REFUSALS: Record<state.PlanCheckoutRefusal, number> = {
  account_deleted: 410,
  not_configured: 503,
};

function isPlanPath(segs: string[]): boolean {
  if (segs[0] !== "v1") return false;
  if (segs[1] === "org")
    return (
      segs[2] === "billing" &&
      (segs[3] === "checkout" || segs[3] === "portal") &&
      segs.length === 4
    );
  if (segs[1] !== "me") return false;
  return (
    segs[2] === "plan" ||
    segs[2] === "plus" ||
    segs[2] === "routines" ||
    (segs[2] === "presence" && segs.length === 3)
  );
}

function routineKey(body: Record<string, unknown> | undefined) {
  const { orgSlug, agentSlug, routineId } = body ?? {};
  return typeof orgSlug === "string" &&
    typeof agentSlug === "string" &&
    typeof routineId === "string"
    ? ({ orgSlug, agentSlug, routineId } satisfies PlanRoutineKey)
    : null;
}

export function handlePlanRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (!isPlanPath(segs)) return undefined;
  const seed = state.planSeed();
  if (!seed || state.getCapabilities().plan !== true)
    return refuse(503, "not_configured", "personal plan is not configured");
  const route = `${method} /${segs.join("/")}`;
  switch (route) {
    case "GET /v1/me/plan":
      state.recordPlanCall("plan");
      return json(seed.summary);
    case "POST /v1/me/plan/announcement":
      state.recordPlanCall("announcement");
      state.dismissAnnouncement(seed);
      return noContent();
    case "GET /v1/me/plus/invoices":
      state.recordPlanCall("invoices");
      return json({ invoices: seed.invoices });
    case "POST /v1/me/plus/checkout":
      state.recordPlanCall("checkout");
      if (seed.checkoutRefusal)
        return refuse(
          CHECKOUT_REFUSALS[seed.checkoutRefusal],
          seed.checkoutRefusal,
          "checkout refused",
        );
      if (seed.summary.plan === "plus")
        return refuse(409, "already_plus", "already on plus");
      return json({ url: seed.checkoutUrl });
    case "POST /v1/me/plus/portal":
      state.recordPlanCall("portal");
      if (!seed.summary.plus.manageable)
        return refuse(409, "no_subscription", "no subscription");
      return json({ url: seed.portalUrl });
    case "POST /v1/org/billing/checkout":
      state.recordPlanCall("checkout", body);
      return json({ url: seed.checkoutUrl });
    case "POST /v1/org/billing/portal":
      state.recordPlanCall("portal");
      return json({ url: seed.portalUrl });
    case "GET /v1/me/routines":
      state.recordPlanCall("routines");
      return json({ routines: seed.routines });
    case "PUT /v1/me/routines/keep": {
      state.recordPlanCall("keep", body);
      const key = routineKey(body);
      const summary = key ? state.keepPlanRoutine(seed, key) : null;
      return summary
        ? json(summary)
        : refuse(404, "routine_not_found", "routine not found");
    }
    case "POST /v1/me/routines/resume":
      state.recordPlanCall("resume");
      return json(state.resumePlanRoutines(seed));
    case "POST /v1/me/presence":
      state.recordPlanCall("presence");
      return noContent();
    default:
      return json({ error: "not found" }, 404);
  }
}

export function planMessageRefusal(): Response | undefined {
  const limit = state.planSeed()?.messageLimit;
  if (!limit || state.getCapabilities().plan !== true) return undefined;
  state.recordPlanCall("send");
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(limit.resetsAt) - Date.now()) / 1000),
  );
  return new Response(
    JSON.stringify({
      error: "message limit reached",
      code: "message_limit",
      limit: limit.limit,
      resetsAt: limit.resetsAt,
      ...(limit.scope ? { scope: limit.scope } : {}),
    }),
    {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Retry-After": String(seconds),
      },
    },
  );
}

export function handlePlanControl(
  body: Record<string, unknown> | undefined,
): Response {
  const seed =
    body?.summary && typeof body.summary === "object"
      ? (body as unknown as state.PlanSeed)
      : null;
  const armed = state.armPlan(seed);
  if (armed) state.setCapabilities({ plan: true });
  else delete state.getCapabilities().plan;
  return json({ plan: armed });
}

export function handlePlanCallsControl(): Response {
  return json({ calls: state.planCalls() });
}
