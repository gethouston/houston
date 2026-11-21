import { FAKE_HOST_URL } from "@houston/fake-host";
import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import { expect, type Page } from "@playwright/test";
import { INNOVA, LA_FILA, ownerChoice, PERSONAL } from "./billing-choice";

export const AFTER_CUTOVER = "2026-10-25T17:00:00.000Z";
export const WINDOW_END = "2026-11-06T05:00:00Z";
export const WINDOW_CLOSED = "2026-11-07T00:00:00.000Z";

const ACME: BillingChoiceOrg = {
  ...INNOVA,
  slug: "4444444444444444",
  name: "Acme",
  memberCount: 2,
  messages30d: 520,
  lastActiveOn: "2026-10-24",
  monthlyTotalCents: 3000,
};

export function provisionalPayer(): BillingChoice {
  return ownerChoice({
    payer: "plus",
    state: "applied",
    provisional: true,
    changeableUntil: WINDOW_END,
    freeOrgSlug: PERSONAL.slug,
    paidOrgSlug: ACME.slug,
    orgs: [
      ACME,
      { ...PERSONAL, messages30d: 240, monthlyTotalCents: 1500 },
      {
        ...LA_FILA,
        memberCount: 3,
        messages30d: 96,
        monthlyTotalCents: 4500,
        seatGraceEndsOn: "2026-11-22",
        lockAt: WINDOW_END,
      },
    ],
  });
}

export function pickedNonPayer(): BillingChoice {
  return ownerChoice({
    state: "applied",
    changeableUntil: WINDOW_END,
    freeOrgSlug: INNOVA.slug,
    orgs: [
      { ...PERSONAL, lockAt: WINDOW_END },
      INNOVA,
      { ...LA_FILA, lockAt: WINDOW_END },
    ],
  });
}

export async function armApplied(
  choice: BillingChoice,
  now: string = AFTER_CUTOVER,
): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/billing-choice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ choice, now }),
  });
  expect(res.ok).toBe(true);
}

export async function installAfterCutoverClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(AFTER_CUTOVER) });
}

export function collectErrorReports(page: Page): string[] {
  const reports: string[] = [];
  page.on("console", (message) => {
    if (/^\[(toast|report):/.test(message.text())) reports.push(message.text());
  });
  return reports;
}
