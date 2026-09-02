/**
 * Visual-regression baselines for the routines screens at phone width
 * (PR 6 of the responsiveness overhaul): the team's merged Routines list and
 * a routine's own screen. Deterministic under the fake host — one seeded
 * routine with a fixed cron whose row summary ("Runs every day at 9:00 AM")
 * never moves; the routine screen's next-run line reads the wall clock, so
 * that span is masked (`data-relative-time`).
 */
import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { openTeamSection, screen } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

// The list footer names the account timezone, auto-seeded from the browser's
// detected zone — pin it so darwin and the linux container render one zone.
test.use({ timezoneId: "UTC" });

async function seedRoutine(name: string): Promise<void> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  await fetch(`${FAKE_HOST_URL}/agents/${agents[0].id}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, prompt: "p", schedule: "0 9 * * *" }),
  });
}

/** Phone-width Routines list + the routine's own screen, both themes. */
for (const theme of THEMES) {
  test(`mobile routines list — ${theme}`, async ({ page }) => {
    await seedRoutine("Morning digest");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page
      .getByTestId("mobile-tab-bar")
      .getByRole("button", { name: "Tasks" })
      .click();
    await openTeamSection(page, "Routines");
    await expect(
      screen(page)
        .getByTestId("routine-row")
        .filter({ hasText: "Morning digest" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-routines-list-${theme}.png`, {
      fullPage: true,
    });
  });

  test(`mobile routine screen — ${theme}`, async ({ page }) => {
    await seedRoutine("Morning digest");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page
      .getByTestId("mobile-tab-bar")
      .getByRole("button", { name: "Tasks" })
      .click();
    await openTeamSection(page, "Routines");
    // The title, not the row center — the center is the schedule-summary
    // button, which opens its own editor popover.
    await screen(page)
      .getByTestId("routine-row")
      .filter({ hasText: "Morning digest" })
      .getByText("Morning digest")
      .click();
    const detail = page.getByTestId("routine-screen");
    await expect(
      detail.getByRole("heading", { name: "Morning digest" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-routine-screen-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}
