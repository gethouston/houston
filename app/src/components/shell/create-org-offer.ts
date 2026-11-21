import type { OrgsList, SeatPrices } from "@houston/engine-adapter";
import { listSeatPrices } from "@houston/sdk";

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
