import { NEW_TASK_PLACEHOLDER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import {
  moreMenu,
  navBar,
  navItem,
  newTaskButton,
  openMoreMenu,
  openPhoneTeamSection,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

test("the two items navigate and mark the active one", async ({ page }) => {
  await page.goto("/");
  await expect(navBar(page)).toBeVisible();

  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
  await expect(navBar(page).getByText("1", { exact: true })).toBeVisible();

  await openMoreMenu(page);
  await expect(navItem(page, "more")).toHaveAttribute("aria-expanded", "true");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");

  await moreMenu(page).getByRole("button", { name: "Settings" }).tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(navItem(page, "more")).toHaveAttribute("aria-current", "page");

  await navItem(page, "agents").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
});

test("the bar hides under a pushed chat and returns when it pops", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);

  await page.goBack();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(navBar(page)).toBeVisible();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
});

test("an employee's own screen lights AI Employees", async ({ page }) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "routines");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
  await expect(navItem(page, "more")).not.toHaveAttribute("aria-current");
});

test("tapping AI Employees from a More screen resets the stack", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  await openMoreMenu(page);
  await moreMenu(page).getByRole("button", { name: "Settings" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await navItem(page, "agents").tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("re-tapping Agents pops a drilled agent back to the list", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  await navItem(page, "agents").tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("the New task button pushes an empty draft chat", async ({ page }) => {
  await page.goto("/");

  await newTaskButton(page).tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toBeVisible();
});
