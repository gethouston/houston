import type { OrgsList, SeatPrices } from "@houston/engine-adapter";
import { listSeatPrices } from "@houston/sdk";

/**
 * What the create dialog offers when the free slot is taken: the name of the
 * org that holds it (`null` for the Personal row, which the app names itself)
 * and a new checkout's seat prices, read off the orgs list. The prices are
 * the gateway's, never a constant here, so a list that carries none offers
 * the paid create, monthly, without a figure. Read on every render, so a
 * refetch after a refused yearly drops the choice at once.
 */
export interface PaidOrgOffer {
  name: string;
  freeOrg: { kind: "personal" } | { kind: "named"; name: string } | null;
  seatPrices: SeatPrices | null;
}

export function paidOrgOffer(
  name: string,
  freeOrgSlug: string,
  orgs: OrgsList | undefined,
): PaidOrgOffer {
  const free = orgs?.orgs.find((org) => org.slug === freeOrgSlug);
  return {
    name,
    freeOrg: !free
      ? null
      : free.kind === "personal"
        ? { kind: "personal" }
        : { kind: "named", name: free.name },
    seatPrices: listSeatPrices(orgs),
  };
}
