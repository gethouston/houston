import { FAKE_HOST_URL } from "@houston/fake-host";
import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { billingScreen, openBilling } from "./plan";

/**
 * The free-org pick, armed on the fake host (`/__test__/billing-choice`), and
 * the pricing-change modal and picker it drives. The page clock is pinned
 * three days before the cutover so every date on screen comes from the
 * fixture.
 */

export const CHOICE_NOW = "2026-10-20T17:00:00.000Z";
export const SPACES_OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  spaces: true,
  role: "owner",
};

const org = (patch: Partial<BillingChoiceOrg>): BillingChoiceOrg => ({
  slug: "0000000000000000",
  name: "",
  personal: false,
  memberCount: 1,
  messages30d: 0,
  lastActiveOn: null,
  monthlyTotalCents: null,
  seatGraceEndsOn: null,
  lockAt: null,
  ...patch,
});

export const PERSONAL = org({
  slug: "3333333333333333",
  name: "Daniel",
  personal: true,
  messages30d: 12,
  lastActiveOn: "2026-10-10",
});
export const INNOVA = org({
  slug: "2222222222222222",
  name: "Innova",
  memberCount: 4,
  messages30d: 210,
  lastActiveOn: "2026-10-18",
});
export const LA_FILA = org({
  slug: "1111111111111111",
  name: "La Fila",
  messages30d: 396,
  lastActiveOn: "2026-10-19",
});

export function ownerChoice(patch: Partial<BillingChoice> = {}): BillingChoice {
  return {
    needed: true,
    payer: null,
    state: "pending",
    provisional: false,
    cutoverAt: "2026-10-23T05:00:00Z",
    changeableUntil: null,
    noticeDismissed: false,
    freeOrgSlug: null,
    paidOrgSlug: null,
    orgs: [PERSONAL, INNOVA, LA_FILA],
    ...patch,
  };
}

/** A Plus payer kept on the $15 Plus price per member, grace on the bigger one. */
export function payerChoice(): BillingChoice {
  return ownerChoice({
    payer: "plus",
    orgs: [
      { ...PERSONAL, monthlyTotalCents: 1500 },
      { ...INNOVA, monthlyTotalCents: 6000, seatGraceEndsOn: "2026-11-22" },
      { ...LA_FILA, monthlyTotalCents: 1500 },
    ],
  });
}

async function post(path: string, data: unknown): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok).toBe(true);
}

export const armCapabilities = (caps: Record<string, unknown>) =>
  post("/__test__/capabilities", caps);

export const armChoice = (
  choice: BillingChoice | null,
  refuse?: "not_owner" | "not_payer" | "same_org",
  options: {
    /** What the gateway answers once a pick is refused. */
    afterRefusal?: BillingChoice;
    /**
     * Refusals the next picks answer, one each, before `refuse`; each may
     * swap the choice the refetch reads (`after`). Then picks store.
     */
    refusals?: {
      refuse: "not_owner" | "not_payer" | "same_org";
      after?: BillingChoice;
    }[];
    /** Every dismissal answers 500. */
    failDismiss?: boolean;
  } = {},
) => post("/__test__/billing-choice", { choice, refuse, ...options });

export async function choiceCalls(): Promise<
  { route: "get" | "set" | "dismiss"; body?: unknown }[]
> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/billing-choice-calls`);
  return ((await res.json()) as { calls: [] }).calls;
}

export async function installChoiceClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(CHOICE_NOW) });
}

/** The modal shown on app open: its intro, then the picker in the same frame. */
export const choiceModal = (page: Page): Locator =>
  page.getByTestId("billing-change-modal");

/** The picker opened from Settings > Billing. */
export const settingsPicker = (page: Page): Locator =>
  page.getByTestId("free-org-picker");

/** Settings > Billing, reached past the modal; the picker opens from there. */
export async function openSettingsPicker(page: Page): Promise<Locator> {
  await page.goto("/");
  await choiceModal(page)
    .getByRole("button", { name: "Maybe later" })
    .first()
    .click({ timeout: 15_000 });
  await openBilling(page);
  return billingScreen(page);
}

export const MODAL_TITLE = "Teams are out of beta";
export const CHOOSE = "Choose my organization for the free tier";

/**
 * Next through the pick's two intro pages to the picker: page two's action
 * is "Choose my organization for the free tier", or Next for a payer.
 */
export async function openPicker(modal: Locator, payer = false): Promise<void> {
  await modal
    .getByRole("button", { name: "Next", exact: true })
    .click({ timeout: 15_000 });
  await modal
    .getByRole("button", { name: payer ? "Next" : CHOOSE, exact: true })
    .click();
}

/** A single-org owner: the one org they own stays free. */
export function singleOrgChoice(
  patch: Partial<BillingChoice> = {},
): BillingChoice {
  return ownerChoice({ needed: false, orgs: [LA_FILA], ...patch });
}

/** A member of an org someone else owns: nothing of theirs to pick. */
export function memberChoice(): BillingChoice {
  return ownerChoice({ needed: false, orgs: [] });
}

/** Seed the app's language before boot (the fixture seeds English). */
export async function seedLocale(
  page: Page,
  locale: "es" | "pt",
): Promise<void> {
  await page.addInitScript((lng: string) => {
    localStorage.setItem("houston.pref.locale", lng);
    localStorage.setItem("i18nextLng", lng);
  }, locale);
}
