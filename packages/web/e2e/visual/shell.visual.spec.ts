import { SEED_AGENT_NAME } from "@houston/fake-host";

import { FOLLOW_UP_PLACEHOLDER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import {
  awaitAgentsHome,
  moreMenu,
  navBar,
  navItem,
  openPhoneTeamSection,
} from "../support/mobile-nav";
import { missionCard } from "../support/team-nav";
import { workspaceMenuTrigger } from "../support/workspace-menu";
import { pinTheme, THEMES } from "./support";

for (const theme of THEMES) {
  test(`board home — ${theme}`, async ({ page }) => {
    await page.goto("/");
    await page
      .locator("[data-sidebar-item]")
      .first()
      .getByRole("button")
      .first()
      .click();

    await expect(workspaceMenuTrigger(page)).toBeVisible();
    await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
    await expect(missionCard(page, "Draft the launch email")).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`board-${theme}.png`, {
      fullPage: true,
    });
  });
}

test("board home — narrow", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");

  await openPhoneTeamSection(page, "mission-control", "click");
  await expect(
    page.getByTestId("agent-missions-screen").getByText("Plan a trip to Tokyo"),
  ).toBeVisible();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot("board-narrow.png", {
    fullPage: true,
    mask: [page.locator("[data-relative-time]")],
  });
});

for (const theme of THEMES) {
  test(`mobile shell — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(await awaitAgentsHome(page)).toContainText(SEED_AGENT_NAME);
    await expect(navBar(page)).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-shell-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

for (const theme of THEMES) {
  test(`mobile mission chat — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await (await awaitAgentsHome(page)).click();
    await page
      .getByTestId("agent-missions-screen")
      .getByText("Plan a trip to Tokyo")
      .click();
    const chat = page.getByTestId("mission-chat-screen");
    await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
    await expect(chat.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-mission-chat-${theme}.png`, {
      fullPage: true,
    });
  });
}

for (const theme of THEMES) {
  test(`mobile agent missions — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await (await awaitAgentsHome(page)).click();
    const missions = page.getByTestId("agent-missions-screen");
    await expect(missions.getByText("Plan a trip to Tokyo")).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-agent-missions-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

for (const theme of THEMES) {
  test(`mobile more menu — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(await awaitAgentsHome(page)).toContainText(SEED_AGENT_NAME);
    await navItem(page, "more").click();
    await expect(moreMenu(page)).toBeVisible();
    await expect(
      moreMenu(page).getByRole("button", { name: "Connect your apps" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-more-menu-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}
