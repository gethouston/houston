import { expect, test } from "./support/fixtures";

/**
 * Add Skills dialog, GitHub tab. Regression guard for the WebKit repaint ghost
 * (skills-from-GitHub bug): the action button is right-pinned by the flex-1
 * search input, so any width change slides its LEFT edge, and on the dialog's
 * frosted `backdrop-filter` surface WebKit leaves a dark ghost of the old
 * rounded cap. The fix pins the button to a stable width (min-w-32) across every
 * label ("Find skills" / "Install N" / "Install 0"), so nothing is ever vacated.
 *
 * We can't screenshot a live-compositor ghost (any snapshot forces a clean
 * repaint), so we assert the mechanism instead: the button's rendered width does
 * not change as its label changes. Browser-agnostic — the width invariant holds
 * everywhere, and killing the width churn is what kills the ghost on WebKit.
 */
test("GitHub install button keeps a stable width across label changes", async ({
  page,
}) => {
  await page.goto("/");

  // Agent Settings (job-description) → Skills row → the Custom skills tab's
  // empty-state CTA opens the GitHub / From-scratch dialog.
  await page.getByRole("button", { name: "Agent Settings" }).click();
  await page.getByText("Skills", { exact: true }).click();
  await page.getByRole("tab", { name: "Custom skills" }).click();
  await page.getByRole("button", { name: "Add skill" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add skills")).toBeVisible();

  // GitHub tab: enter a repo, discover its skills.
  await dialog.getByRole("button", { name: "GitHub" }).click();

  // The discover button is the first state of the pinned action button.
  const findButton = dialog.getByRole("button", { name: "Find skills" });
  const findWidth = (await findButton.boundingBox())?.width ?? 0;

  await dialog.getByPlaceholder("owner/repo").fill("mattpocock/skills");
  await findButton.click();

  // The fake host returns a canned dozen; all are selected by default.
  await expect(dialog.getByText("12 skills found")).toBeVisible();
  const installAll = dialog.getByRole("button", { name: "Install 12" });
  await expect(installAll).toBeVisible();
  const installAllWidth = (await installAll.boundingBox())?.width ?? 0;

  // Deselect all → the count drops to a narrower label.
  await dialog.getByText("Deselect all").click();
  const installNone = dialog.getByRole("button", { name: "Install 0" });
  await expect(installNone).toBeVisible();
  const installNoneWidth = (await installNone.boundingBox())?.width ?? 0;

  // The label changed width ("Find skills" / "Install 12" / "Install 0" have
  // different intrinsic widths) but the rendered button must not: no vacated
  // rounded cap for WebKit to ghost.
  expect(installAllWidth).toBeGreaterThan(0);
  expect(Math.abs(installAllWidth - installNoneWidth)).toBeLessThan(0.5);
  expect(Math.abs(installAllWidth - findWidth)).toBeLessThan(0.5);
  // And it's the padded, stable pill width, not the intrinsic label width.
  expect(installNoneWidth).toBeGreaterThanOrEqual(120);
});
