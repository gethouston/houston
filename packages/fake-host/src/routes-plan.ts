/**
 * The C19 personal-plan surface (`/v1/me/plan*`, `/v1/me/plus/*`,
 * `/v1/me/routines*`, `/v1/me/presence`), the `/__test__/plan` control that
 * arms it, and the `429 message_limit` a chat send answers while the armed
 * person is at their weekly limit.
 *
 * Refusals are the flat `{error, code}` the Go gateway writes; the plan OFF
 * answers `503 not_configured` exactly as the gateway does, which is what every
 * spec that never arms the plan sees (and never asks for: the client gates on
 * the capability).
 */

import type { PlanRoutineKey } from "@houston/wire-types";
import { CORS, json, noContent } from "./http";
import * as state from "./state";

const refuse = (status: number, code: string, error: string): Response =>
  json({ error, code }, status);

/** The status the gateway pairs with each armable checkout refusal. */
const CHECKOUT_REFUSALS: Record<state.PlanCheckoutRefusal, number> = {
  account_deleted: 410,
  not_configured: 503,
};

/** True for a path the personal plan owns (the gateway's `/v1/me/*` set). */
function isPlanPath(segs: string[]): boolean {
  if (segs[0] !== "v1" || segs[1] !== "me") return false;
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

/** Route a personal-plan request, or return `undefined` to fall through. */
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

/**
 * The gateway's refusal of a turn start by a Free person at the limit, or
 * `undefined` when no limit is armed. `Retry-After` is the seconds until
 * `resetsAt`, as the contract states; the ledger records the attempt so a spec
 * can prove the client never retried it.
 */
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

/**
 * `POST /__test__/plan`: `{ summary, invoices?, routines?, checkoutUrl?,
 * portalUrl?, messageLimit?, checkoutRefusal? }` arms the plan AND advertises the `plan`
 * capability (the gateway's one switch drives both); `{ summary: null }`
 * turns both off. Returns the armed world.
 */
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

/** `GET /__test__/plan-calls`: every plan call (and refused send) since arming. */
export function handlePlanCallsControl(): Response {
  return json({ calls: state.planCalls() });
}
