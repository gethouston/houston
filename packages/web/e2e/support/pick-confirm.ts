import { FAKE_HOST_URL } from "@houston/fake-host";
import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import { expect, type Page } from "@playwright/test";
import { INNOVA, LA_FILA, ownerChoice, PERSONAL } from "./billing-choice";

/**
 * The free-org pick after the cutover applied it: the page clock sits inside
 * the 14-day change window, and the fake host's gateway clock is armed to
 * match (or past the window, for a closed one), so every date on screen
 * comes from the fixture.
 */

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

/**
 * A Plus payer who never picked: the cutover kept Personal free, moved the
 * subscription to Acme, and locks the three-member La Fila when the window
 * ends.
 */
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

/** A non-payer who picked Innova before the cutover, now applied. */
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

/** Arm the applied pick, with the gateway's clock at `now`. */
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

/**
 * Every report the app files for an unexpected error: `showErrorToast` and
 * `reportError` log a `[toast:…]` or `[report:…]` line on their way to
 * Sentry and PostHog.
 */
export function collectErrorReports(page: Page): string[] {
  const reports: string[] = [];
  page.on("console", (message) => {
    if (/^\[(toast|report):/.test(message.text())) reports.push(message.text());
  });
  return reports;
}
