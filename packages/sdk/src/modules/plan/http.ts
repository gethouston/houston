import type {
  PlanCheckout,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";

/** Read the person's plan across all spaces.
 * @assistant group:settings
 */
export async function getPlan(scope: HttpScope): Promise<PlanSummary> {
  return (await (
    await httpRequest(scope, "/v1/me/plan")
  ).json()) as PlanSummary;
}

/** Dismiss the one-time personal plan announcement across devices.
 * @assistant group:settings hidden: only the person seeing the announcement may dismiss it.
 * @assistant unconfirmed: This only records that the announcement was seen.
 */
export async function dismissPlanAnnouncement(scope: HttpScope): Promise<void> {
  await httpRequest(scope, "/v1/me/plan/announcement", { method: "POST" });
}

/** Start a Plus subscription checkout.
 * @assistant group:billing
 * @assistant confirm: money. This starts a paid personal subscription. */
export async function createPlusCheckout(
  scope: HttpScope,
): Promise<PlanCheckout> {
  return (await (
    await httpRequest(scope, "/v1/me/plus/checkout", { method: "POST" })
  ).json()) as PlanCheckout;
}

/** Open the person's subscription management page.
 * @assistant group:billing hidden: the URL grants access to a signed-in billing session.
 * @assistant hands: request_hands_on(billing) */
export async function createPlusPortal(
  scope: HttpScope,
): Promise<PlanCheckout> {
  return (await (
    await httpRequest(scope, "/v1/me/plus/portal", { method: "POST" })
  ).json()) as PlanCheckout;
}

/** List the person's recent Plus invoices.
 * @assistant group:billing
 */
export async function listPlusInvoices(
  scope: HttpScope,
): Promise<{ invoices: PlusInvoice[] }> {
  return (await (await httpRequest(scope, "/v1/me/plus/invoices")).json()) as {
    invoices: PlusInvoice[];
  };
}
