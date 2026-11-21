import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { openPhoneTeamSection } from "../support/mobile-nav";
import { screen } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

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

for (const theme of THEMES) {
  test(`mobile routines list — ${theme}`, async ({ page }) => {
    await seedRoutine("Morning digest");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await openPhoneTeamSection(page, "routines", "click");
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

    await openPhoneTeamSection(page, "routines", "click");
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
