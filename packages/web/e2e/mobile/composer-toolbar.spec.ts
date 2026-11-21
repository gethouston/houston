import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";

async function openChat(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByTestId("composer-toolbar")).toBeVisible();
}

for (const width of [360, 412]) {
  test(`every toolbar control is a 44px target at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await openChat(page);
    const toolbar = page.getByTestId("composer-toolbar");
    const sizes = await toolbar.locator("button").evaluateAll((buttons) =>
      buttons
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => [r.width, r.height]),
    );
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const [w, h] of sizes) {
      expect(h).toBeGreaterThanOrEqual(44);
      expect(w).toBeGreaterThanOrEqual(44);
    }
  });
}

test("the context ring stays in view while the pickers scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 700 });
  await openChat(page);
  const pickers = page.getByTestId("composer-toolbar-pickers");
  const overflow = await pickers.evaluate(
    (el) => el.scrollWidth - el.clientWidth,
  );
  expect(overflow).toBeGreaterThan(0);
  await pickers.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const ring = page.getByTestId("composer-toolbar").getByRole("button", {
    name: "Context usage",
  });
  const box = await ring.boundingBox();
  if (!box) throw new Error("the context ring is not laid out");
  expect(box.x + box.width).toBeLessThanOrEqual(280);
  expect(box.x).toBeGreaterThanOrEqual(0);
  const docOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(docOverflow).toBeLessThanOrEqual(0);
});
