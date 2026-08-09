import { expect, test } from "./support/fixtures";
import { startGuidedTour } from "./support/tour-nav";

test("Guide me tour places replay before the final closing step", async ({
  page,
}) => {
  await page.goto("/");
  // The tour is armed from "Guide me", the first item behind the help control
  // in the rail's FOOTER: being walked through the app is not a destination, so
  // it no longer spends a row among them. Walked the way a user reaches it.
  await startGuidedTour(page);

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText(/^Tour \d+ of \d+$/) });
  const title = dialog.getByRole("heading", { level: 2 });
  await expect(dialog).toBeVisible();

  for (let guard = 0; guard < 20; guard++) {
    if ((await title.textContent()) === "Replay the tour") break;
    await dialog.getByRole("button", { name: "Next" }).click();
  }

  await expect(title).toHaveText("Replay the tour");
  await expect(dialog.getByRole("button", { name: "Next" })).toBeVisible();

  // And it points at the control that actually replays it. The `appTour` anchor
  // moved off the deleted rail row onto the footer's help trigger, so the step
  // spotlights a "?" beside the gear — not a destination the rail no longer has.
  await expect(page.locator('[data-tour-target="appTour"]')).toHaveAttribute(
    "aria-label",
    "Help",
  );

  const counter = await dialog.getByText(/^Tour \d+ of \d+$/).textContent();
  const match = /^Tour (\d+) of (\d+)$/.exec(counter ?? "");
  expect(Number(match?.[1])).toBe(Number(match?.[2]) - 1);

  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(title).toHaveText("Now go build something amazing");
  await expect(
    dialog.getByRole("button", { name: "I'll do something amazing" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next" })).toHaveCount(0);
});

test("the tour walks the app-level destinations starting at the Inbox", async ({
  page,
}) => {
  await page.goto("/");
  await startGuidedTour(page);

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText(/^Tour \d+ of \d+$/) });
  const title = dialog.getByRole("heading", { level: 2 });
  await expect(dialog).toBeVisible();

  const titles: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const current = (await title.textContent()) ?? "";
    titles.push(current);
    if (current === "Replay the tour") break;
    await dialog.getByRole("button", { name: "Next" }).click();
  }

  // There is no global Mission Control to walk through any more, so the step
  // that spotlighted its nav row is gone outright…
  expect(titles).not.toContain("Tasks");
  // …and the Inbox — the one screen that belongs to no team — leads the
  // app-level destinations, immediately before the integrations step.
  const inbox = titles.indexOf("Inbox");
  expect(inbox).toBeGreaterThan(-1);
  expect(titles[inbox + 1]).toBe("Connect your apps");
  // Which puts it AFTER the team's own steps: the tour teaches a team first.
  expect(titles.indexOf("Files")).toBeLessThan(inbox);
});
