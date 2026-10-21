/**
 * The free-org pick (`/v1/me/billing-choice*`), the `/__test__/billing-choice`
 * control that arms it, and the ledger a spec reads back. Refusals are the
 * flat `{error, code}` the Go gateway writes, with its statuses.
 */

import type { BillingChoice, BillingChoicePick } from "@houston/wire-types";
import { json, noContent } from "./http";
import * as state from "./state-billing-choice";

const STATUS = {
  not_owner: 409,
  not_payer: 409,
  same_org: 400,
  choice_closed: 409,
} as const;
const PICK_KEYS = new Set(["freeOrgSlug", "paidOrgSlug"]);

/** The pick, validated the way the gateway does, or null for `invalid_request`. */
function pickOf(body: Record<string, unknown> | undefined) {
  if (!body || Object.keys(body).some((k) => !PICK_KEYS.has(k))) return null;
  const { freeOrgSlug, paidOrgSlug } = body;
  if (typeof freeOrgSlug !== "string" || freeOrgSlug === "") return null;
  if (paidOrgSlug === undefined || paidOrgSlug === null)
    return { freeOrgSlug } satisfies BillingChoicePick;
  if (typeof paidOrgSlug !== "string" || paidOrgSlug === "") return null;
  return { freeOrgSlug, paidOrgSlug } satisfies BillingChoicePick;
}

/** Route a billing-choice request, or return `undefined` to fall through. */
export function handleBillingChoiceRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (segs[0] !== "v1" || segs[1] !== "me" || segs[2] !== "billing-choice")
    return undefined;
  const choice = state.billingChoice();
  if (!choice) return json({ error: "not found" }, 404);
  const route = `${method} /${segs.join("/")}`;
  switch (route) {
    case "GET /v1/me/billing-choice":
      state.recordBillingChoiceCall("get");
      return json(choice);
    case "PUT /v1/me/billing-choice": {
      state.recordBillingChoiceCall("set", body);
      const pick = pickOf(body);
      if (!pick)
        return json({ error: "invalid request", code: "invalid_request" }, 400);
      const refusal = state.refuseBillingPick(choice, pick);
      if (refusal)
        return json({ error: refusal, code: refusal }, STATUS[refusal]);
      return json(state.storeBillingPick(choice, pick));
    }
    case "POST /v1/me/billing-choice/dismiss":
      state.recordBillingChoiceCall("dismiss");
      if (state.dismissFails())
        return json(
          { error: "billing choice unavailable", code: "choice_unavailable" },
          500,
        );
      state.dismissBillingChoice(choice);
      return noContent();
    default:
      return json({ error: "not found" }, 404);
  }
}

/**
 * `POST /__test__/billing-choice`: `{ choice, refuse?, afterRefusal?,
 * failDismiss?, now? }` arms it ({@link state.BillingChoiceArming}),
 * `{ choice: null }` disarms.
 */
export function handleBillingChoiceControl(
  body: Record<string, unknown> | undefined,
): Response {
  const choiceOf = (value: unknown) =>
    value && typeof value === "object" ? (value as BillingChoice) : null;
  const refuse =
    typeof body?.refuse === "string" && Object.hasOwn(STATUS, body.refuse)
      ? (body.refuse as state.BillingPickRefusal)
      : null;
  state.armBillingChoice(choiceOf(body?.choice), {
    refuse,
    afterRefusal: choiceOf(body?.afterRefusal),
    failDismiss: body?.failDismiss === true,
    now: typeof body?.now === "string" ? body.now : null,
  });
  return json({ choice: state.billingChoice() });
}

/** `GET /__test__/billing-choice-calls`: every call since arming. */
export function handleBillingChoiceCallsControl(): Response {
  return json({ calls: state.billingChoiceCalls() });
}
