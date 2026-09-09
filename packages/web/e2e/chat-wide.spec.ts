import { expect, test } from "./support/fixtures";
import {
  missionCard,
  navRow,
  openTeamSection,
  screen,
} from "./support/team-nav";

/**
 * The wide chat (PRODUCT-1722): a mission's chat can fill the whole content
 * row — the assistant's own full-width presentation — and shrink back to the
 * side card. The preference sticks across chats, the wide header leads with
 * the way back to the board, and a surface that never opted in (a setup chat
 * beside its catalog) keeps its host on screen whatever the preference says.
 */

test("a mission chat expands to the wide layout and comes back", async ({
  page,
}) => {
  await page.goto("/");
  await openTeamSection(page, "Tasks");
  await missionCard(page, "Plan a trip to Tokyo").click();

  const panel = page.getByTestId("mission-panel");
  const main = page.locator("main");
  await expect(panel).toBeVisible();
  await expect(main).toBeVisible();

  // Side card: the toggle offers to expand, the X is the way out.
  const toggle = panel.getByTestId("panel-width-toggle");
  await expect(toggle).toHaveAttribute("data-state", "side");
  await expect(
    panel.getByRole("button", { name: "Close panel" }),
  ).toBeVisible();

  await toggle.click();
  // Wide: the board leaves the layout; the header leads with the way back
  // and drops the X.
  await expect(main).toBeHidden();
  await expect(panel).toHaveAttribute("data-wide", "true");
  await expect(panel.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(panel.getByTestId("panel-back-to-board")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close panel" })).toBeHidden();

  // Back to tasks: the chat closes and the board is where it was.
  await panel.getByTestId("panel-back-to-board").click();
  await expect(panel).toBeHidden();
  await expect(main).toBeVisible();
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  // The preference stuck: the next chat opens wide.
  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(panel).toHaveAttribute("data-wide", "true");
  await expect(main).toBeHidden();

  // Shrink: the side card, board beside it, X back in the header.
  await panel.getByTestId("panel-width-toggle").click();
  await expect(main).toBeVisible();
  await expect(panel).not.toHaveAttribute("data-wide", "true");
  await expect(
    panel.getByRole("button", { name: "Close panel" }),
  ).toBeVisible();
});

test("the wide preference never hides a setup chat's host", async ({
  page,
}) => {
  await page.goto("/");
  await openTeamSection(page, "Tasks");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const panel = page.getByTestId("mission-panel");
  await panel.getByTestId("panel-width-toggle").click();
  await expect(page.locator("main")).toBeHidden();

  // The team's tab row sits inside <main>, off the layout while the chat is
  // wide: the rail is the way to another screen. Leaving the board releases
  // its claim and the board comes back; then the Routines intake claims the
  // panel WITHOUT wide consent, so its list stays beside the chat.
  await navRow(page, "skills").click();
  await expect(page.locator("main")).toBeVisible();
  await expect(panel).toBeHidden();
  await openTeamSection(page, "Routines");
  await page.getByRole("button", { name: "New routine" }).first().click();
  await expect(panel).toBeVisible();
  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expect(panel).not.toHaveAttribute("data-wide", "true");
  await expect(panel.getByTestId("panel-width-toggle")).toBeHidden();
  await expect(screen(page)).toBeVisible();
});
