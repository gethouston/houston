import { SEED_AGENT_NAME } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { awaitAgentsHome } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

async function openEmployeeMenu(page: Page): Promise<void> {
  await page.goto("/");
  await (await awaitAgentsHome(page)).tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  await page.getByTestId("agent-missions-menu").tap();
}

const sectionItem = (page: Page, section: string) =>
  page
    .getByTestId("agent-missions-menu-section")
    .and(page.locator(`[data-section='${section}']`));

test("the task list menu lists the employee's other sections", async ({
  page,
}) => {
  await openEmployeeMenu(page);
  await expect(page.getByTestId("agent-missions-menu-section")).toHaveText([
    "Routines",
    "Files",
    "Settings",
  ]);
});

for (const section of ["routines", "files"] as const) {
  test(`${section} opens that tab and back returns to the task list`, async ({
    page,
  }) => {
    await openEmployeeMenu(page);
    await sectionItem(page, section).tap();
    await expect(screen(page)).toHaveAttribute("data-screen", "agent");
    await expect(
      screen(page).locator(`[data-team-section-tab='${section}']`),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("agent-mobile-back")).toHaveAttribute(
      "aria-label",
      SEED_AGENT_NAME,
    );
    await page.getByTestId("agent-mobile-back").tap();
    await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  });
}

const tab = (page: Page, section: string) =>
  screen(page).locator(`[data-team-section-tab='${section}']`);

test("switching tabs never stacks: back returns to the task list", async ({
  page,
}) => {
  await openEmployeeMenu(page);
  await sectionItem(page, "routines").tap();
  await tab(page, "files").tap();
  await expect(tab(page, "files")).toHaveAttribute("aria-current", "page");
  await tab(page, "routines").tap();
  await expect(tab(page, "routines")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("agent-mobile-back").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
  await expect(page.getByTestId("agents-home")).toBeVisible();
});

test("the Tasks tab is the employee's one task list", async ({ page }) => {
  await openEmployeeMenu(page);
  await sectionItem(page, "files").tap();
  await tab(page, "mission-control").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await page.goBack();
  await expect(page.getByTestId("agents-home")).toBeVisible();
});

test("Settings opens in place and back returns to the task list", async ({
  page,
}) => {
  await openEmployeeMenu(page);
  await sectionItem(page, "settings").tap();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await screen(page).locator("[data-agent-settings-back]").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
});

test("the Settings tab's back returns to the task list without stacking", async ({
  page,
}) => {
  await openEmployeeMenu(page);
  await sectionItem(page, "routines").tap();
  await tab(page, "settings").tap();
  await screen(page).locator("[data-agent-settings-back]").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("agents-home")).toBeVisible();
});

test("a phone never shows the employee's desktop board", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
});
