/**
 * The free-org pick a spec arms (`/__test__/billing-choice`): the
 * `BillingChoice` the gateway would compute for the signed-in person.
 *
 * Disarmed (the seed) is a gateway that predates the change: every route
 * answers 404, so every spec that never arms it runs exactly as before. The
 * routes mutate the armed choice the way the gateway's store would, and every
 * call lands in a ledger a spec reads back.
 */

import type { BillingChoice, BillingChoicePick } from "@houston/wire-types";

export type BillingChoiceCallRoute = "get" | "set" | "dismiss";

export interface BillingChoiceCall {
  route: BillingChoiceCallRoute;
  body?: unknown;
}

export type BillingPickRefusal =
  | "not_owner"
  | "not_payer"
  | "same_org"
  | "choice_closed";

/** What a spec arms beyond the choice itself. */
export interface BillingChoiceArming {
  /**
   * Every pick answers this refusal, which the client never provokes on its
   * own (it only offers orgs the person owns).
   */
  refuse?: BillingPickRefusal | null;
  /**
   * The choice the gateway computes once a refusal lands: the person's orgs
   * changed under the picker (a transfer, a deletion).
   */
  afterRefusal?: BillingChoice | null;
  /** Every dismissal answers 500 and stores nothing. */
  failDismiss?: boolean;
  /**
   * The gateway's clock, which decides whether an applied pick may still
   * change. Unset: the real time.
   */
  now?: string | null;
}

let armed: BillingChoice | null = null;
let arming: BillingChoiceArming = {};
let calls: BillingChoiceCall[] = [];

export function resetBillingChoice(): void {
  armed = null;
  arming = {};
  calls = [];
}

/** Arm (or, with `null`, disarm) the choice; clears the ledger. */
export function armBillingChoice(
  choice: BillingChoice | null,
  options: BillingChoiceArming = {},
): void {
  armed = choice ? structuredClone(choice) : null;
  arming = structuredClone(options);
  calls = [];
}

/** Whether a dismissal should fail, as armed. */
export function dismissFails(): boolean {
  return arming.failDismiss === true;
}

export function billingChoice(): BillingChoice | null {
  return armed;
}

export function recordBillingChoiceCall(
  route: BillingChoiceCallRoute,
  body?: unknown,
): void {
  calls.push(body === undefined ? { route } : { route, body });
}

export function billingChoiceCalls(): BillingChoiceCall[] {
  return calls;
}

/** The gateway's refusal for a pick, in the gateway's order, or null when it stores. */
export function refuseBillingPick(
  choice: BillingChoice,
  pick: BillingChoicePick,
): BillingPickRefusal | null {
  const forced = arming.refuse ?? null;
  if (forced) {
    if (arming.afterRefusal) armed = structuredClone(arming.afterRefusal);
    return forced;
  }
  if (
    choice.state === "applied" &&
    gatewayNow() >= Date.parse(choice.changeableUntil ?? choice.cutoverAt)
  )
    return "choice_closed";
  const paid = pick.paidOrgSlug;
  if (paid !== undefined && paid === pick.freeOrgSlug) return "same_org";
  if (paid !== undefined && choice.payer !== "plus" && choice.payer !== "comp")
    return "not_payer";
  const owned = (slug: string) => choice.orgs.some((org) => org.slug === slug);
  if (!owned(pick.freeOrgSlug)) return "not_owner";
  return paid === undefined || owned(paid) ? null : "not_owner";
}

function gatewayNow(): number {
  return arming.now ? Date.parse(arming.now) : Date.now();
}

/**
 * Store the pick. Before the cutover it is only recorded. After it, the
 * gateway applies it at once, as C4 answers inside the change window: the
 * free and paid orgs unlock, every other owned org locks when the window
 * ends, and the pick is no longer the cutover's guess. Repeating the applied
 * pick changes nothing.
 */
export function storeBillingPick(
  choice: BillingChoice,
  pick: BillingChoicePick,
): BillingChoice {
  const paid = pick.paidOrgSlug ?? null;
  if (choice.state === "applied") {
    if (choice.freeOrgSlug === pick.freeOrgSlug && choice.paidOrgSlug === paid)
      return choice;
    const kept = new Set([pick.freeOrgSlug, paid]);
    for (const org of choice.orgs)
      org.lockAt = kept.has(org.slug) ? null : choice.changeableUntil;
    choice.provisional = false;
  }
  choice.freeOrgSlug = pick.freeOrgSlug;
  choice.paidOrgSlug = paid;
  return choice;
}

export function dismissBillingChoice(choice: BillingChoice): void {
  choice.noticeDismissed = true;
}
