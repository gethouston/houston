import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import {
  missionCard,
  openArchivedTasks,
  openTeamSection,
  screen,
} from "./support/team-nav";
import { openNavRow } from "./support/workspace-menu";

test.use({ teamBoard: true });

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

  const toggle = panel.getByTestId("panel-width-toggle");
  await expect(toggle).toHaveAttribute("data-state", "side");
  await expect(
    panel.getByRole("button", { name: "Close panel" }),
  ).toBeVisible();

  await toggle.click();
  await expect(main).toBeHidden();
  await expect(panel).toHaveAttribute("data-wide", "true");
  await expect(panel.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(panel.getByTestId("panel-back-to-board")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close panel" })).toBeHidden();

  await panel.getByTestId("panel-back-to-board").click();
  await expect(panel).toBeHidden();
  await expect(main).toBeVisible();
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(panel).toHaveAttribute("data-wide", "true");
  await expect(main).toBeHidden();

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

  await openNavRow(page, "integrations");
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

test("an archived mission's chat goes wide with its own way back", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "archived-wide",
      title: "Quarterly review",
      status: "archived",
    },
  });
  await page.goto("/");
  await openTeamSection(page, "Tasks");
  await openArchivedTasks(page);
  await screen(page).getByText("Quarterly review").first().click();

  const panel = page.getByTestId("mission-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("panel-width-toggle").click();
  await expect(page.locator("main")).toBeHidden();
  await expect(panel).toHaveAttribute("data-wide", "true");
  const back = panel.getByTestId("panel-back-to-board");
  await expect(back).toHaveText(/Back to archived/);
  await expect(panel.getByRole("button", { name: "Close panel" })).toBeHidden();

  await back.click();
  await expect(panel).toBeHidden();
  await expect(page.locator("main")).toBeVisible();
  await expect(screen(page).getByText("Quarterly review")).toBeVisible();
});
