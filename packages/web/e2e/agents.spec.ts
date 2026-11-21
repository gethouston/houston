import { SEED_AGENT_NAME } from "@houston/fake-host";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { missionCard, rail, screen } from "./support/team-nav";
import { workspaceMenuTrigger } from "./support/workspace-menu";

test("creates an agent and shows it in the sidebar", async ({ page }) => {
  await page.goto("/");

  await expect(workspaceMenuTrigger(page)).toBeVisible();

  await createAgent(page, "Marketing Bot");

  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Marketing Bot").first()).toBeVisible();
});

test("switches between two agents", async ({ page }) => {
  await page.goto("/");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  await createAgent(page, "Research Bot");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", {
      name: "Start Research Bot's first day",
    }),
  ).toBeVisible();

  await rail(page)
    .getByRole("button", { name: new RegExp(`^${SEED_AGENT_NAME}\\b`) })
    .click();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});

test("starts a new AI Employee's first day from its board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-tour-target='agents']")).toBeVisible();

  await createAgent(page, "Ops Bot");
  const start = screen(page).getByRole("button", {
    name: "Start Ops Bot's first day",
  });
  await expect(start).toBeVisible();

  await start.click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Task: Getting set up")).toBeVisible();
  await expect(missionCard(page, "Getting set up")).toBeVisible();
  await expect(start).toHaveCount(0);
});
