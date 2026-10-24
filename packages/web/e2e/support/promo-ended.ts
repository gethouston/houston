import { FAKE_HOST_URL } from "@houston/fake-host";
import type { OrgBilling } from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { workspaceMenuTrigger } from "./workspace-menu";

/** A team whose billing owner still pays the $15 promotional monthly price. */
const TEAM = { slug: "00000000000000ab", name: "Acme" };

export function promoBilling(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "paid",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 3,
    interval: "month",
    seatPriceCents: 1500,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: "2026-11-14T17:00:00.000Z",
    priceNotice: {
      kind: "promo_ended",
      previousCents: 1500,
      nextCents: 2000,
      renewsAt: "2026-11-14T17:00:00.000Z",
    },
    nextAdjustment: null,
    usage: null,
    routines: null,
    ...patch,
  };
}

export async function armFake(path: string, data: unknown): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok).toBe(true);
}

export async function enterPromoTeam(
  page: Page,
  billing: OrgBilling,
): Promise<void> {
  await armFake("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role: "owner",
  });
  await armFake("workspaces", { teams: [{ ...TEAM, billing }] });
  await page.goto("/");
  const trigger = workspaceMenuTrigger(page);
  await trigger.click();
  await page.getByRole("menuitemcheckbox", { name: TEAM.name }).click();
}

export const promoModal = (page: Page) => page.getByTestId("promo-ended-modal");

/** Wait for the modal's first control, the way an app open shows it. */
export async function promoOpen(page: Page): Promise<Locator> {
  const modal = promoModal(page);
  await expect(modal.getByRole("button").first()).toBeVisible({
    timeout: 15_000,
  });
  return modal;
}
