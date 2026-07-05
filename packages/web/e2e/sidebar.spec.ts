import { expect, test } from "./support/fixtures";

/**
 * Collapsed-sidebar expand affordances (HOU-657): the workspace monogram at
 * the TOP of the rail doubles as the expand button (hover swaps the initial
 * for the expand icon), clicking empty rail space also expands, and clicks on
 * interactive rail elements (nav, agents) keep their own action.
 */
test("collapsed sidebar expands from the top monogram and rail clicks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Mission Control")).toBeVisible();

  const sidebar = page.locator("[data-tour-target='sidebar']");

  // Collapse via the (unchanged) top-right collapse button.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");

  // Exactly one expand button, and it sits at the TOP of the rail (the
  // monogram slot) — not at the bottom where the old toggle lived.
  const expandBtn = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expandBtn).toHaveCount(1);
  const btnBox = await expandBtn.boundingBox();
  const asideBox = await sidebar.boundingBox();
  if (!btnBox || !asideBox) throw new Error("missing bounding boxes");
  expect(btnBox.y - asideBox.y).toBeLessThan(30);

  // Hover swaps the monogram for the expand icon; click expands.
  await expandBtn.hover();
  await expect(expandBtn.locator("svg")).toBeVisible();
  await expandBtn.click();
  await expect(sidebar).toHaveCSS("width", "220px");

  // Clicking an EMPTY spot on the collapsed rail expands too.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");
  await page.mouse.click(asideBox.x + 28, asideBox.y + asideBox.height - 200);
  await expect(sidebar).toHaveCSS("width", "220px");

  // Clicking an interactive rail element (a nav button) must NOT expand.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");
  await sidebar.locator("nav button").first().click();
  await expect(sidebar).toHaveCSS("width", "56px");
});
