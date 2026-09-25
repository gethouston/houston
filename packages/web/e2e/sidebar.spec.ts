import { expect, test } from "./support/fixtures";
import { navRow } from "./support/team-nav";

/**
 * The collapsed rail has one visible expand control above the workspace menu.
 */
test("collapsed sidebar expands from its visible toggle", async ({ page }) => {
  await page.goto("/");
  await expect(navRow(page, "integrations")).toBeVisible();

  const sidebar = page.locator("[data-tour-target='sidebar']");

  // Collapse via the top-right toggle.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");

  // Exactly one expand button sits above the workspace monogram.
  const expandBtn = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expandBtn).toHaveCount(1);
  const btnBox = await expandBtn.boundingBox();
  const asideBox = await sidebar.boundingBox();
  if (!btnBox || !asideBox) throw new Error("missing bounding boxes");
  expect(btnBox.y - asideBox.y).toBeLessThan(30);

  await expect(expandBtn.locator("svg")).toBeVisible();
  const workspaceButton = page
    .locator('[data-tour-target="spaceSwitcher"] button')
    .first();
  await expect(workspaceButton).toBeVisible();
  await expandBtn.click();
  await expect(sidebar).toHaveCSS("width", "220px");

  // The monogram opens its menu and empty rail space leaves the rail closed.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");
  await workspaceButton.click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(asideBox.x + 28, asideBox.y + asideBox.height - 200);
  await expect(sidebar).toHaveCSS("width", "56px");

  // Nav buttons keep their own action.
  await sidebar.locator("nav button").first().click();
  await expect(sidebar).toHaveCSS("width", "56px");
});
