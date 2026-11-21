import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";
import { openNavRow, workspaceMenuTrigger } from "./support/workspace-menu";

function visibleHighlight(page: import("@playwright/test").Page) {
  return page.locator("[data-highlighted]:visible");
}

async function pressAndRecordPrevention(
  page: import("@playwright/test").Page,
  keys: string[],
): Promise<Record<string, boolean>> {
  await page.evaluate(() => {
    const seen: Record<string, boolean> = {};
    (window as unknown as { __keyPrevented: typeof seen }).__keyPrevented =
      seen;
    window.addEventListener("keydown", (e) => {
      seen[e.key] = e.defaultPrevented;
    });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  for (const key of keys) await page.keyboard.press(key);
  return page.evaluate(
    () =>
      (window as unknown as { __keyPrevented: Record<string, boolean> })
        .__keyPrevented,
  );
}

test.use({ teamBoard: true });

test("a kept-alive employee board off the glass owns nothing, and takes the keys back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(workspaceMenuTrigger(page)).toBeVisible();

  const onScreenMission = page
    .getByTestId("board-columns")
    .getByText("Plan a trip to Tokyo")
    .filter({ visible: true });

  await openTeamSection(page, "Tasks");
  await expect(onScreenMission).toHaveCount(1);

  await openNavRow(page, "integrations");
  await expect(onScreenMission).toHaveCount(0);
  await expect(
    page.getByTestId("board-columns").getByText("Plan a trip to Tokyo"),
  ).toHaveCount(1);

  const prevented = await pressAndRecordPrevention(page, [
    "ArrowRight",
    "Enter",
  ]);
  expect(prevented).toEqual({ ArrowRight: false, Enter: false });
  await expect(visibleHighlight(page)).toHaveCount(0);
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  await openTeamSection(page, "Tasks");
  await expect(onScreenMission).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(visibleHighlight(page)).toHaveCount(1);

  const title = await visibleHighlight(page).locator("p").first().innerText();
  expect(title.trim()).not.toEqual("");
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("mission-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(title.trim());
});

test("a team's Routines section does not swallow the arrow keys or Enter", async ({
  page,
}) => {
  await page.goto("/");
  await expect(workspaceMenuTrigger(page)).toBeVisible();

  await openTeamSection(page, "Tasks");
  await expect(
    page
      .getByTestId("board-columns")
      .getByText("Plan a trip to Tokyo")
      .filter({ visible: true }),
  ).toHaveCount(1);

  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();

  const prevented = await pressAndRecordPrevention(page, [
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "Enter",
  ]);
  expect(prevented).toEqual({
    ArrowDown: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false,
    Enter: false,
  });

  await openTeamSection(page, "Tasks");
  await page.keyboard.press("ArrowRight");
  await expect(visibleHighlight(page)).toHaveCount(1);
});
