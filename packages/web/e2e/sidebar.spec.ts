import { expect, test } from "./support/fixtures";
import { agentRow, navRow } from "./support/team-nav";

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
  const workspaceButton = sidebar.locator("button[title]").first();
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

/**
 * The agent row's "..." menu: the settings page's actions re-anchored on the
 * rail. It sits in the affordance slot (outside the row button, after the
 * needs-you count), is always visible (never hover-gated), and each action
 * opens the SAME confirmation surface the agent's Settings section uses.
 */
test("an agent row's ... menu offers copy and delete behind their own dialogs", async ({
  page,
}) => {
  await page.goto("/");
  const row = agentRow(page, "Houston").locator("..");
  const trigger = row.getByTestId("agent-row-menu");
  await expect(trigger).toBeVisible();

  // Copy opens the copy dialog, pre-named with the first free name.
  await trigger.click();
  await page.getByRole("menuitem", { name: "Duplicate Houston" }).click();
  await expect(page.locator("#agent-copy-name")).toHaveValue("Houston copy");
  await page.keyboard.press("Escape");
  await expect(page.locator("#agent-copy-name")).toHaveCount(0);

  // Delete asks for confirmation first; cancelling keeps the agent.
  await trigger.click();
  await page.getByRole("menuitem", { name: "Delete Houston" }).click();
  await expect(
    page.getByRole("alertdialog").or(page.getByRole("dialog")).first(),
  ).toContainText("Delete");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(agentRow(page, "Houston")).toBeVisible();
});
