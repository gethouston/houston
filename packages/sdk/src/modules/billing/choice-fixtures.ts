import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";

export const CUTOVER = "2026-10-23T05:00:00Z";
export const BEFORE = Date.parse("2026-10-20T17:00:00.000Z");

export function org(patch: Partial<BillingChoiceOrg> = {}): BillingChoiceOrg {
  return {
    slug: "aaaaaaaaaaaaaaaa",
    name: "La Fila",
    personal: false,
    memberCount: 1,
    messages30d: 0,
    lastActiveOn: null,
    monthlyTotalCents: null,
    seatGraceEndsOn: null,
    lockAt: null,
    ...patch,
  };
}

export const LA_FILA = org({
  slug: "1111111111111111",
  name: "La Fila",
  messages30d: 396,
  lastActiveOn: "2026-10-19",
});
export const INNOVA = org({
  slug: "2222222222222222",
  name: "Innova",
  memberCount: 4,
  messages30d: 210,
  lastActiveOn: "2026-10-18",
});
export const PERSONAL = org({
  slug: "3333333333333333",
  name: "daniel",
  personal: true,
  messages30d: 12,
  lastActiveOn: "2026-10-10",
});

export function choice(patch: Partial<BillingChoice> = {}): BillingChoice {
  return {
    needed: true,
    payer: null,
    state: "pending",
    provisional: false,
    cutoverAt: CUTOVER,
    changeableUntil: null,
    noticeDismissed: false,
    freeOrgSlug: null,
    paidOrgSlug: null,
    orgs: [PERSONAL, INNOVA, LA_FILA],
    ...patch,
  };
}
