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

/**
 * The phone shell's floating nav bar: AI Employees · More in a pill, with the
 * compose button beside it.
 *
 * AI Employees is a TREE — a tap lands on its root and RESETS the nav stack
 * (native tab semantics, so browser back after it must not re-enter the
 * abandoned trail). More is a menu over the shell, which is why it lights for
 * every screen the tree does not own rather than naming one of its own.
 */

test("the two items navigate and mark the active one", async ({ page }) => {
  await page.goto("/");
  await expect(navBar(page)).toBeVisible();

  // Boot lands on the Agents home — the phone's landing tree.
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
  // The seeded needs-you mission is the Agents item's count badge: the user's
  // review queue, carried by the bar itself.
  await expect(navBar(page).getByText("1", { exact: true })).toBeVisible();

  // More is a menu, not a place: it opens the card over the shell.
  await openMoreMenu(page);
  // While the card is up the More item lights as EXPANDED; the screen behind
  // it (AI Employees) stays the one current page.
  await expect(navItem(page, "more")).toHaveAttribute("aria-expanded", "true");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");

  // Picking a destination from the menu closes it and lands on that screen —
  // and every screen outside the tree lights More.
  await moreMenu(page).getByRole("button", { name: "Settings" }).tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(navItem(page, "more")).toHaveAttribute("aria-current", "page");

  // AI Employees roots back on the home list.
  await navItem(page, "agents").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
});

test("the bar hides under a pushed chat and returns when it pops", async ({
  page,
}) => {
  await page.goto("/");

  // Drill to the pushed chat: chat is a push, not a tab, so the bar leaves the
  // screen to the chat and its own back affordance.
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);

  // Back pops the chat; the bar is the constant way around again.
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

  // Drill somewhere on the AI Employees tree...
  await page.getByTestId("agents-home-row").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  // ...leave for a More destination, then come back through the tab.
  await openMoreMenu(page);
  await moreMenu(page).getByRole("button", { name: "Settings" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await navItem(page, "agents").tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();

  // Browser back walks a decayed pre-reset entry: it clamps onto the fresh
  // root instead of re-entering the trail the user navigated away from.
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

  // The active tree's own root: re-tapping abandons the drill.
  await navItem(page, "agents").tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("the New task button pushes an empty draft chat", async ({ page }) => {
  await page.goto("/");

  await newTaskButton(page).tap();
  // One connected agent: the flow skips the picker sheet and pushes the draft
  // chat, composer ready for the first message.
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toBeVisible();
});
