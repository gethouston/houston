import type { OrgsList } from "@houston/engine-adapter";

/**
 * What the create dialog offers when the free slot is taken: the name of the
 * org that holds it (`null` for the Personal row, which the app names itself)
 * and the price of a seat, read off that org's billing. The price is the
 * gateway's, never a constant here, so an org whose billing is unknown offers
 * the paid create without a figure.
 */
export interface PaidOrgOffer {
  name: string;
  freeOrg: { kind: "personal" } | { kind: "named"; name: string } | null;
  seatPriceCents: number | null;
}

export function paidOrgOffer(
  name: string,
  freeOrgSlug: string,
  orgs: OrgsList | undefined,
): PaidOrgOffer {
  const free = orgs?.orgs.find((org) => org.slug === freeOrgSlug);
  const priced =
    free?.billing ?? orgs?.orgs.find((org) => org.billing)?.billing;
  return {
    name,
    freeOrg: !free
      ? null
      : free.kind === "personal"
        ? { kind: "personal" }
        : { kind: "named", name: free.name },
    seatPriceCents: priced?.seatPriceCents ?? null,
  };
}
