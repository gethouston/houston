/**
 * The free-org pick REST calls (`/v1/me/billing-choice*`). Account-scoped: the
 * gateway reads the caller's session alone, so the pick an owner makes is the
 * same from every space they are in.
 */

import {
  BILLING_CHOICE_REFUSALS,
  type BillingChoice,
  type BillingChoicePick,
  type BillingChoiceRefusal,
  billingChoiceSchema,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { refusalCode, refusalStatus } from "../refusal-code";

/** What a save answers: the stored choice, or a state the person is in. */
export type BillingChoiceSave =
  | { kind: "saved"; choice: BillingChoice }
  | { kind: BillingChoiceRefusal };

/**
 * The refusal behind a failed pick, or null for every other error. A code is
 * recognized only with the status the contract pairs it with, so an unrelated
 * error carrying the same word stays a bug.
 */
export function billingChoiceRefusal(
  error: unknown,
): BillingChoiceRefusal | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (code === null || !Object.hasOwn(BILLING_CHOICE_REFUSALS, code))
    return null;
  const refusal = code as BillingChoiceRefusal;
  return BILLING_CHOICE_REFUSALS[refusal] === refusalStatus(error)
    ? refusal
    : null;
}

/**
 * Shows which organization stays free when plans move to organizations, and which one a subscription pays for.
 *
 * The signed-in person's free-org pick, every organization they own with its
 * members and last 30 days of messages, and the date the change takes effect.
 * Answers null when this deployment does not run the change.
 * @assistant group:billing
 */
export async function getChoice(
  scope: HttpScope,
): Promise<BillingChoice | null> {
  try {
    const res = await httpRequest(scope, "/v1/me/billing-choice");
    return billingChoiceSchema.parse(await res.json());
  } catch (err) {
    if (err instanceof Error && refusalStatus(err) === 404) return null;
    throw err;
  }
}

/**
 * Chooses which organization stays free, and for a Plus subscriber which organization the subscription pays for.
 *
 * Stores the pick until the change takes effect; it can be changed again
 * until then. Answers `not_owner` for an organization the person does not
 * own, `not_payer` when someone without a subscription names a paid
 * organization, and `same_org` when both are the same. After the change takes
 * effect it changes or confirms the applied pick for a while, then answers
 * `choice_closed`.
 * @assistant group:billing
 * @assistant confirm: money. The organizations not picked will need a paid plan to keep sending messages.
 */
export async function setChoice(
  scope: HttpScope,
  pick: BillingChoicePick,
): Promise<BillingChoiceSave> {
  try {
    const res = await httpRequest(scope, "/v1/me/billing-choice", {
      method: "PUT",
      body: JSON.stringify(pick),
    });
    return {
      kind: "saved",
      choice: billingChoiceSchema.parse(await res.json()),
    };
  } catch (err) {
    const refusal = billingChoiceRefusal(err);
    if (refusal) return { kind: refusal };
    throw err;
  }
}

/**
 * Hides the announcement about plans moving to organizations, on every device.
 * @assistant group:billing hidden: only the person reading the announcement may dismiss it.
 * @assistant unconfirmed: This only records that the announcement was seen.
 * @assistant hands: unreachable the person dismisses the announcement from the modal they are reading, which no card stands in for.
 */
export async function dismissChoiceNotice(scope: HttpScope): Promise<void> {
  await httpRequest(scope, "/v1/me/billing-choice/dismiss", { method: "POST" });
}
