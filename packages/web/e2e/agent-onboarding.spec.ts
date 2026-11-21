import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import {
  closeActivityPanel,
  fillAgentBrief,
  newAgentButton,
  openNewAgent,
} from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { missionCard, screen } from "./support/team-nav";

function setupHello(name: string): string {
  return `Hi, I'm ${name}, your financial analyst! Today is my first day, so help me learn how I can be most useful to you.`;
}

function agentMessages(page: Page) {
  return page.locator("[data-conversation-message-key]:not(.is-user)");
}

function firstDayButton(page: Page, name: string) {
  return screen(page).getByRole("button", {
    name: `Start ${name}'s first day`,
  });
}

async function createFromScratch(page: Page, name: string) {
  await openNewAgent(page);
  await fillAgentBrief(page);
  const nameField = page.getByPlaceholder(/^e\.g\. /);
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();
  await expect(firstDayButton(page, name)).toBeVisible({ timeout: 10_000 });
}

async function createAndStartFirstDay(page: Page, name: string) {
  await createFromScratch(page, name);
  await firstDayButton(page, name).click();
}

test("creating an agent waits for the user; the first-day button starts setup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await createFromScratch(page, "Aurora");
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeHidden();

  await firstDayButton(page, "Aurora").click();

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Task: Getting set up")).toBeVisible();
  await expect(firstDayButton(page, "Aurora")).toHaveCount(0);
});

test("the welcome chat is live before the board sweep returns its row", async ({
  page,
}) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await createFromScratch(page, "Solstice");

  const SWEEP_HOLD_MS = 8_000;
  await page.route(/\/activities(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, SWEEP_HOLD_MS));
    await route.fallback();
  });

  await firstDayButton(page, "Solstice").click();

  await expect(agentMessages(page).first()).toBeVisible({ timeout: 4_000 });
  await expect(agentMessages(page).nth(1)).toBeVisible({ timeout: 10_000 });
});

test("the setup mission opens on its hello, with no user bubble at all", async ({
  page,
}) => {
  await page.goto("/");
  await createAndStartFirstDay(page, "Stratus");

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });

  await expect(agentMessages(page).first()).toContainText(
    setupHello("Stratus"),
    { timeout: 10_000 },
  );

  await expect(page.locator(".is-user")).toHaveCount(0);

  await expect(agentMessages(page).nth(1)).toBeVisible({ timeout: 10_000 });
  await expect(agentMessages(page).first()).toContainText(
    setupHello("Stratus"),
  );
});

test("the setup mission shows as a card on the new agent's board", async ({
  page,
}) => {
  await page.goto("/");
  await createAndStartFirstDay(page, "Nimbus");

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await closeActivityPanel(page);

  const card = screen(page)
    .locator("[data-kanban-card]")
    .filter({ hasText: "Getting set up" });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Set up", { exact: true })).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

test("closing the setup panel leaves the shell usable with the agent in the sidebar", async ({
  page,
}) => {
  await page.goto("/");
  await createAndStartFirstDay(page, "Cirrus");

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });

  await closeActivityPanel(page);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  await expect(newAgentButton(page)).toBeVisible();
  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Cirrus").first()).toBeVisible();
});

test('"Something else" answers in the row the filter stood in', async ({
  page,
}) => {
  await page.goto("/");
  await openNewAgent(page);

  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create a new AI Employee" })
    .click();
  const filter = dialog.getByRole("textbox", { name: "Search industries" });
  const door = dialog.getByRole("button", { name: "Something else" });
  const answer = dialog.getByRole("textbox", {
    name: "Tell us in a few words",
  });
  const runs = dialog.locator('[role="radiogroup"]').locator("xpath=..");
  await expect(filter).toBeVisible();

  await door.click();
  await expect(filter).toHaveCount(0);
  await expect(answer).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible();

  await expect(runs.getByText("Finance", { exact: true })).toBeVisible();
  await expect(runs).toHaveAttribute("inert", "");
  await expect(runs).toHaveClass(/opacity-50/);

  await answer.press("Escape");
  await expect(filter).toBeVisible();
  await expect(door).toBeFocused();

  await filter.fill("Falc");
  await door.click();
  await expect(answer).toHaveValue("Falc");
  await answer.fill("Falconry");
  await answer.press("Enter");
  await expect(
    dialog.getByRole("heading", { name: "What should it do for you?" }),
  ).toBeVisible();
});
