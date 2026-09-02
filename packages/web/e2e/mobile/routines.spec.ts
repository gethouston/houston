import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { openTeamSection, screen } from "../support/team-nav";

/**
 * Routines on a phone (the tier-1 CI gate's last leg): the team's Routines
 * section is reachable from the Tasks tab's team screen, the merged list is
 * usable at a Pixel-7-class width, and a row tap opens the routine's own
 * screen — never a popover — with its actions reachable and nothing forcing
 * a horizontal scroll.
 */

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

async function horizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test("a routine opens as its own screen from the phone team view", async ({
  page,
}) => {
  await seedRoutine("Morning digest");

  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");

  // The section strip is collapsed at phone width; the helper drives the
  // compact switcher for us.
  await openTeamSection(page, "Routines");
  const row = screen(page)
    .getByTestId("routine-row")
    .filter({ hasText: "Morning digest" });
  await expect(row).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Row tap → the routine's own screen (PRODUCT-1208: never a popover),
  // with every header action on screen at 412px. Tap the TITLE: the row's
  // center is the schedule-summary button, which opens its own editor.
  await row.getByText("Morning digest").tap();
  const detail = page.getByTestId("routine-screen");
  await expect(
    detail.getByRole("heading", { name: "Morning digest" }),
  ).toBeVisible();
  await expect(detail.getByRole("button", { name: "Runs" })).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Edit in chat" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Back returns to the list.
  await detail.getByRole("button", { name: "Back" }).tap();
  await expect(page.getByTestId("routine-screen")).toHaveCount(0);
  await expect(
    screen(page)
      .getByTestId("routine-row")
      .filter({ hasText: "Morning digest" }),
  ).toBeVisible();
});
