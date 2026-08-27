import { expect, test } from "../support/fixtures";

/**
 * Phone-project smoke: the app boots and is usable at a Pixel-7-class
 * viewport (412px logical width, touch input, mobile UA — see the `mobile`
 * project in playwright.config.ts). This is the scaffold spec for the
 * responsiveness overhaul: deeper phone coverage lands beside it as the
 * mobile shell grows.
 */

test("boots to a usable shell on a phone viewport", async ({ page }) => {
  await page.goto("/");

  // The phone shell: sidebar collapsed behind the hamburger, board content
  // (the seeded mission) on screen.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Nothing forces the document wider than the phone viewport.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("touch drives the UI: tapping a mission opens its chat", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await page.getByRole("button", { name: "Close panel" }).tap();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});
