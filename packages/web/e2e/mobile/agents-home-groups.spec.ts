import { SEED_AGENT_ID } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { createSheet, teamNameField } from "../support/sidebar-create";
import {
  readSidebarLayout,
  seedSidebarLayout,
} from "../support/sidebar-layout";

/**
 * The phone manages groups from the AI Employees list: New group in the title
 * row, and the picked group's menu beside the "All groups" filter.
 */

const screen = (page: Page) => page.locator('[data-screen-active="true"]');
const filter = (page: Page) => page.getByTestId("agents-home-team-filter");

async function bootWithGroup(page: Page): Promise<void> {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "work", name: "Work", collapsed: false, agentIds: [SEED_AGENT_ID] },
    ],
    order: [],
  });
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
}

async function pickWork(page: Page): Promise<void> {
  await filter(page).tap();
  await page
    .getByTestId("agents-home-team-option")
    .and(page.locator('[data-team-id="work"]'))
    .tap();
  await expect(filter(page)).toContainText("Work");
}

test("New group opens the group form and stays on the list", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, { groups: [], order: [] });
  await page.goto("/");
  await page.getByTestId("agents-home-new-group").tap();
  await teamNameField(page).fill("Studio");
  await createSheet(page).getByRole("button", { name: "Create group" }).tap();
  await expect(createSheet(page)).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await filter(page).tap();
  await expect(
    page.getByTestId("agents-home-team-option").filter({ hasText: "Studio" }),
  ).toBeVisible();
});

test("the folder menu shows only once a group is picked", async ({ page }) => {
  await bootWithGroup(page);
  await expect(screen(page).getByTestId("team-folder-menu")).toHaveCount(0);
  await pickWork(page);
  await expect(screen(page).getByTestId("team-folder-menu")).toBeVisible();
});

test("the picked group renames in place", async ({ page }) => {
  await bootWithGroup(page);
  await pickWork(page);
  await screen(page).getByTestId("team-folder-menu").tap();
  await page.getByRole("menuitem", { name: "Rename" }).tap();
  await page.getByRole("textbox", { name: "Group name" }).fill("Studio");
  await page.getByRole("button", { name: "Save" }).tap();
  await expect(filter(page)).toContainText("Studio");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
});

test("deleting the picked group returns the filter to All groups", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "work", name: "Work", collapsed: false, agentIds: [SEED_AGENT_ID] },
      { id: "later", name: "Later", collapsed: false, agentIds: [] },
    ],
    order: [],
  });
  await page.goto("/");
  await pickWork(page);
  await screen(page).getByTestId("team-folder-menu").tap();
  await page.getByRole("menuitem", { name: "Delete group" }).tap();
  // Nothing is deleted until the user confirms, and the dialog says the AI
  // Employees stay.
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("The AI Employees in this group stay");
  expect(
    (await readSidebarLayout(page.request)).groups.map((g) => g.id),
  ).toEqual(["work", "later"]);
  await confirm.getByRole("button", { name: "Delete group" }).tap();
  await expect(filter(page)).toContainText("All groups");
  await expect(screen(page).getByTestId("team-folder-menu")).toHaveCount(0);
  await expect(screen(page)).toContainText("Houston");
  await expect
    .poll(async () =>
      (await readSidebarLayout(page.request)).groups.map((g) => g.id),
    )
    .toEqual(["later"]);
});

test("an empty group says how to fill it", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [{ id: "later", name: "Later", collapsed: false, agentIds: [] }],
    order: [],
  });
  await page.goto("/");
  await filter(page).tap();
  await page
    .getByTestId("agents-home-team-option")
    .and(page.locator('[data-team-id="later"]'))
    .tap();
  await expect(screen(page).getByTestId("agents-home-row")).toHaveCount(0);
  await expect(screen(page)).toContainText("No AI Employees in this group");
  await expect(screen(page)).toContainText("Move to group");
});
