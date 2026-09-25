import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import {
  closeActivityPanel,
  fillAgentBrief,
  newAgentRow,
} from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { missionCard, screen } from "./support/team-nav";

/**
 * The agent self-setup flow. Creating an agent through the dialog lands on its
 * board with its first day pending (`lib/agent-first-day.ts`); the board's
 * "Start <name>'s first day" button fires the self-setup mission and opens the
 * chat panel on it beside the board.
 *
 * The user typed nothing, so the mission has NO user bubble: the directive
 * rides the auto-continue marker and the transcript folds it away on both the
 * live and the reload path. What the user sees is the agent speaking first, a
 * board card titled `setupMission.title` ("Getting set up"), and the "Set up"
 * tag on that card.
 *
 * The mission's first message is a hello naming the agent and the job it was
 * hired for, from the record the create writes (`lib/setup-mission-greeting.ts`)
 * — so it is whole in the first paint, it is the same sentence on every run, and
 * it stays at the top of the transcript once the agent itself replies.
 */

/** The first paragraph of the hello for an agent created through
 *  `fillAgentBrief` (Finance / Financial analyst), word for word from
 *  `chat:setupGreeting.textWithRole`. Only the first paragraph: the greeting
 *  renders as separate `<p>` elements, so the whole text never matches one. */
function setupHello(name: string): string {
  return `Hi, I'm ${name}, your financial analyst! Today is my first day, so help me learn how I can be most useful to you.`;
}

/** Everything in the transcript that is NOT a user bubble (`is-user` is the
 *  bubble's own marker, `chat-mentions.spec.ts` reads the same pair). */
function agentMessages(page: Page) {
  return page.locator("[data-conversation-message-key]:not(.is-user)");
}

/** The new agent's board offer, scoped to the screen ON THE GLASS: every
 *  kept-alive board can show the same employee's start button. */
function firstDayButton(page: Page, name: string) {
  return screen(page).getByRole("button", {
    name: `Start ${name}'s first day`,
  });
}

/** Open the create dialog and make an agent from scratch, leaving the dialog to
 *  close itself onto the new agent's board, first day still pending. */
async function createFromScratch(page: Page, name: string) {
  await newAgentRow(page).click();
  await fillAgentBrief(page);
  const nameField = page.getByPlaceholder(/^e\.g\. /);
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();
  await expect(firstDayButton(page, name)).toBeVisible({ timeout: 10_000 });
}

/** Create an agent, then start its first day from the board: the setup
 *  mission starts and its chat panel opens. */
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
  // Nothing starts on its own: no chat panel opened on the create.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeHidden();

  await firstDayButton(page, "Aurora").click();

  // (a) The chat panel opens on the setup mission: its follow-up composer
  // (an existing conversation) and "Getting set up" title are present, and
  // the start button is gone for good.
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
  // Created first, so the new board has painted its start button before the
  // hold below begins.
  await createFromScratch(page, "Solstice");

  // Hold every activities READ, so the cross-agent sweep cannot return the new
  // mission's row for the whole assertion budget below. That is the co-located
  // reality this guards: no warming entry carries the identity, and the sweep
  // is a beat behind — so the panel opens on a card nobody can name unless the
  // first-day start published it (`lib/created-mission-handoff.ts`). Without the
  // publish the chat sits blank here until the hold lifts.
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

  // The hello is derived rather than fetched, but deriving it takes the agent
  // path and session key of a mission the sweep has not returned — so its
  // presence here proves the panel got both from the created-mission handoff.
  await expect(agentMessages(page).first()).toBeVisible({ timeout: 4_000 });
  // And the transcript under it is live on that same session key: the fake
  // host's own reply lands as a second agent message.
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

  // The hello names the job the agent was hired for, because the create
  // recorded it alongside the name at the moment it asked for both.
  await expect(agentMessages(page).first()).toContainText(
    setupHello("Stratus"),
    { timeout: 10_000 },
  );

  // The user typed nothing: the directive rides the auto-continue marker, so
  // the transcript folds it away and the agent is the only voice here.
  await expect(page.locator(".is-user")).toHaveCount(0);

  // The agent's own reply lands UNDER the hello, never in place of it.
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

  // (b) The board carries a "Getting set up" mission card for the new agent,
  // and the seeded agent's mission is gone (a fresh agent has its own board).
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await closeActivityPanel(page);

  // Scoped to the screen ON THE GLASS: every top-level view is kept alive, so
  // the (hidden) global board holds the same card.
  const card = screen(page)
    .locator("[data-kanban-card]")
    .filter({ hasText: "Getting set up" });
  await expect(card).toHaveCount(1);
  // The card says WHY it exists: the user never asked for this mission.
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

  // (c) Dismissing the panel returns to a usable shell: the sidebar carries the
  // new agent and its New-agent control is interactive again.
  await closeActivityPanel(page);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  await expect(newAgentRow(page)).toBeVisible();
  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Cirrus").first()).toBeVisible();
});

test('"Something else" answers in the row the filter stood in', async ({
  page,
}) => {
  await page.goto("/");
  await newAgentRow(page).click();

  const dialog = page.getByRole("dialog");
  // The seeded roster gives the dialog its opening choice; the guided brief
  // lives behind the hire card.
  await dialog.getByRole("button", { name: "Hire a new AI Employee" }).click();
  const filter = dialog.getByRole("textbox", { name: "Search industries" });
  const door = dialog.getByRole("button", { name: "Something else" });
  const answer = dialog.getByRole("textbox", {
    name: "Tell us in a few words",
  });
  // The chips' radio group (named for the question) sits inside the wrapper
  // that dims and goes inert while a typed answer holds the row.
  const runs = dialog.locator('[role="radiogroup"]').locator("xpath=..");
  await expect(filter).toBeVisible();

  // Taking the door swaps the row IN PLACE: the filter's own slot becomes the
  // answer field, and the door becomes the Continue that confirms it. Nothing
  // opens at the foot of the sheet.
  await door.click();
  await expect(filter).toHaveCount(0);
  await expect(answer).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible();

  // The suggestions stay on screen as the context the question was asked in,
  // but nothing in them can be reached while the answer is being typed.
  await expect(runs.getByText("Finance", { exact: true })).toBeVisible();
  await expect(runs).toHaveAttribute("inert", "");
  await expect(runs).toHaveClass(/opacity-50/);

  // Escape gives the filter back, and the door with it, holding the focus.
  await answer.press("Escape");
  await expect(filter).toBeVisible();
  await expect(door).toBeFocused();

  // The words already in the filter ARE the answer: the door carries them
  // over rather than asking for them twice, and Enter is the Continue.
  await filter.fill("Falc");
  await door.click();
  await expect(answer).toHaveValue("Falc");
  await answer.fill("Falconry");
  await answer.press("Enter");
  await expect(
    dialog.getByRole("heading", { name: "What should it do for you?" }),
  ).toBeVisible();
});
