import {
  COPY_SOURCE,
  createDialog,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "../support/copy-agent";
import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone runs the SAME copy wizard inside the same create dialog; only the
 * door differs (the Agents home title row's New-agent control). The chooser's
 * tiles stack as full-width rows below 768px, and every wizard screen fits
 * the phone dialog without horizontal overflow.
 */
test("copies an agent from the Agents home on the phone", async ({
  page,
  request,
}) => {
  await seedCopySource(request);
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");

  await screen(page).getByTestId("agents-home-new-agent").click();
  const dialog = createDialog(page);
  // Three choices, stacked: each tile is as wide as the dialog's content.
  const tiles = dialog.getByRole("button", {
    name: /^(From the store|Create new|Copy an agent)$/,
  });
  await expect(tiles).toHaveCount(3);
  const boxes = await tiles.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()),
  );
  for (const box of boxes) expect(box.width).toBe(boxes[0].width);
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom - 1);

  await openCopyWizard(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await rowSwitch(page, COPY_SOURCE.learnings[0]).click();
  await next(page);
  await expect(rowSwitch(page, COPY_SOURCE.routine.name)).toBeChecked();
  await next(page);
  await expect(rowSwitch(page, "Invoice Triage")).toBeChecked();
  await next(page);

  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  await dialog.getByRole("button", { name: "Create Agent" }).click();
  await expect(dialog).toBeHidden();

  // Nothing forced the document wider than the phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  // The copy opens on its own Tasks screen, the same landing every create
  // door uses; its header names it.
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Houston copy" }),
  ).toBeVisible();
});
