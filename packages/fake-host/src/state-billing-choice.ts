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

export interface BillingQueuedRefusal {
  refuse: BillingPickRefusal;
  after?: BillingChoice | null;
}

export interface BillingChoiceArming {
  refuse?: BillingPickRefusal | null;
  afterRefusal?: BillingChoice | null;
  refusals?: BillingQueuedRefusal[];
  failDismiss?: boolean;
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

export function armBillingChoice(
  choice: BillingChoice | null,
  options: BillingChoiceArming = {},
): void {
  armed = choice ? structuredClone(choice) : null;
  arming = structuredClone(options);
  calls = [];
}

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

export function refuseBillingPick(
  choice: BillingChoice,
  pick: BillingChoicePick,
): BillingPickRefusal | null {
  const queued = arming.refusals?.shift();
  if (queued) {
    if (queued.after) armed = structuredClone(queued.after);
    return queued.refuse;
  }
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
