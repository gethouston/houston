import {
  CLAIM_FREE_REFUSALS,
  seatCheckoutRequestSchema,
} from "@houston/wire-types";
import { json, noContent } from "./http";
import { isFilesWrite } from "./routes-files";
import * as state from "./state";

const refuse = (status: number, code: string, error: string): Response =>
  json({ error, code }, status);

const notBillingOwner = () =>
  refuse(403, "not_billing_owner", "only the billing owner can do this");

export function handleOrgBillingRoutes(
  method: string,
  segs: string[],
  req: Request,
  body?: Record<string, unknown>,
): Response | undefined {
  if (segs[0] !== "v1" || segs[1] !== "org" || segs[2] !== "billing")
    return undefined;
  if (method !== "POST" || segs.length !== 4) return undefined;
  const slug = state.requestOrgSlug(req);
  const owner = state.orgBillingOf(slug)?.isBillingOwner === true;
  const seed = state.planSeed();
  switch (segs[3]) {
    case "checkout": {
      const asked = seatCheckoutRequestSchema.safeParse(body ?? {});
      if (!asked.success)
        return refuse(
          400,
          "invalid_interval",
          "interval must be month or year",
        );
      state.recordPlanCall("checkout", { orgSlug: slug, ...asked.data });
      if (!owner) return notBillingOwner();
      if (asked.data.interval === "year" && !state.sellsYearlySeat())
        return refuse(409, "interval_unavailable", "yearly billing is off");
      return json({ url: seed?.checkoutUrl ?? state.FAKE_CHECKOUT_URL });
    }
    case "portal":
      state.recordPlanCall("portal", { orgSlug: slug });
      if (!owner) return notBillingOwner();
      return json({ url: seed?.portalUrl ?? state.FAKE_PORTAL_URL });
    case "free": {
      state.recordPlanCall("org_free", { orgSlug: slug });
      const refusal = state.claimFreeSlot(slug);
      return refusal
        ? refuse(CLAIM_FREE_REFUSALS[refusal], refusal, "free slot refused")
        : noContent();
    }
    default:
      return undefined;
  }
}

export function lockedWriteRefusal(
  method: string,
  segs: string[],
  req: Request,
): Response | undefined {
  if (segs[0] !== "agents" || method === "GET") return undefined;
  const create = segs.length === 1 && method === "POST";
  const send =
    segs[2] === "conversations" && segs[4] === "messages" && method === "POST";
  const files = segs[2] === "files" && isFilesWrite(method, segs[3]);
  if (!create && !send && !files) return undefined;
  const slug = state.requestOrgSlug(req);
  if (!state.orgWritesLocked(slug)) return undefined;
  const billing = state.orgBillingOf(slug);
  return json(
    {
      error: "this organization is locked",
      code: "needs_upgrade",
      reason: billing?.lockReason ?? null,
      lockAt: billing?.lockAt ?? null,
    },
    403,
  );
}
