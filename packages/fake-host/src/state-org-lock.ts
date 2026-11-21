import type {
  ClaimFreeRefusal,
  FreeOrg,
  OrgBilling,
} from "@houston/wire-types";
import {
  PERSONAL_ORG_SLUG,
  planFreeOrg,
  planOrgBilling,
} from "./state-org-billing";
import { planSeed } from "./state-plan";
import { state } from "./state-store";

export function requestOrgSlug(req: Request): string {
  return req.headers.get("x-houston-org") ?? PERSONAL_ORG_SLUG;
}

export function orgBillingOf(slug: string): OrgBilling | null {
  if (slug === PERSONAL_ORG_SLUG) {
    const seed = planSeed();
    return seed ? planOrgBilling(seed) : null;
  }
  return (
    state.teamWorkspaces.find((row) => row.id === `org:${slug}`)?.billing ??
    null
  );
}

export function setOrgBilling(slug: string, billing: OrgBilling): void {
  if (slug === PERSONAL_ORG_SLUG) {
    const seed = planSeed();
    if (seed) seed.personalBilling = billing;
    return;
  }
  const row = state.teamWorkspaces.find((r) => r.id === `org:${slug}`);
  if (row) row.billing = billing;
}

function setFreeOrg(freeOrg: FreeOrg): void {
  const seed = planSeed();
  if (seed) seed.freeOrg = freeOrg;
}

export function orgWritesLocked(slug: string): boolean {
  return orgBillingOf(slug)?.status === "locked";
}

export function claimFreeSlot(slug: string): ClaimFreeRefusal | null {
  const billing = orgBillingOf(slug);
  if (!billing?.isBillingOwner) return "not_billing_owner";
  if (billing.tier === "paid") return "has_subscription";
  const seed = planSeed();
  const previous = seed ? planFreeOrg(seed).orgSlug : null;
  if (previous && previous !== slug) {
    const held = orgBillingOf(previous);
    if (held)
      setOrgBilling(previous, {
        ...held,
        status: "locked",
        lockAt: new Date().toISOString(),
        lockReason: "unpaid",
        freeSlot: false,
      });
  }
  setOrgBilling(slug, {
    ...billing,
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
  });
  setFreeOrg({ available: false, orgSlug: slug });
  return null;
}
