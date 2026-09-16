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
 * The reworked agent self-setup flow. Creating an agent through the dialog no
 * longer opens a full-screen activation flow — instead the dialog fires the
 * agent's self-setup mission in the normal shell, switches to the board, and
 * auto-opens the chat panel on that mission
 * (`setActivityPanelId(conversationId, { forceOpen: true })`). The mission's
 * visible bubble is `agentOnboarding:setupMission.kickoff` ("Help me get set
 * up") and its board card is `setupMission.title` ("Getting set up"); the real
 * directive rides the hidden `buildPrompt` and never renders.
 */

/** Open the create dialog and make an agent from scratch (leaves the dialog to
 *  close itself and the setup-mission panel to auto-open). */
async function createFromScratch(page: Page, name: string) {
  await newAgentRow(page).click();
  await fillAgentBrief(page);
  const nameField = page.getByPlaceholder("e.g. Product manager, Sales, Jerry");
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();
}

test("creating an agent auto-starts its setup mission and opens the chat", async ({
  page,
}) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await createFromScratch(page, "Aurora");

  // (a) The chat panel auto-opens on the setup mission: its follow-up composer
  // (an existing conversation) and "Getting set up" title are present.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Task: Getting set up")).toBeVisible();
});

test("the welcome chat is live before the board sweep returns its row", async ({
  page,
}) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  // Hold every activities READ, so the cross-agent sweep cannot return the new
  // mission's row for the whole assertion budget below. That is the co-located
  // reality this guards: no warming entry carries the identity, and the sweep
  // is a beat behind — so the panel opens on a card nobody can name unless the
  // create published it (`lib/created-mission-handoff.ts`). Without the
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

  await createFromScratch(page, "Solstice");

  // A live conversation, not an empty shell: the panel's transcript carries the
  // user bubble the create just sent (its session key + agent path resolved).
  await expect(page.locator(".is-user").first()).toBeVisible({
    timeout: 4_000,
  });
});

test("the setup mission's visible user bubble shows the kickoff copy", async ({
  page,
}) => {
  await page.goto("/");
  await createFromScratch(page, "Stratus");

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });

  // The visible first user bubble is the kickoff, NOT the hidden directive.
  // Scoped to the user bubble (`.is-user`) so it tests the chat message, not the
  // mission card's description (which also reads "Help me get set up").
  //
  // NOTE: until the parallel `displayText` engine fix lands, the current tree
  // renders the full `buildPrompt` directive in this bubble instead, so this
  // assertion is EXPECTED to fail locally until then ("bubble assertion pending
  // displayText fix"). It encodes the CORRECT post-fix behavior on purpose.
  await expect(
    page.locator(".is-user").filter({ hasText: "Help me get set up" }),
  ).toBeVisible();
});

test("the setup mission shows as a card on the new agent's board", async ({
  page,
}) => {
  await page.goto("/");
  await createFromScratch(page, "Nimbus");

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
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

test("closing the setup panel leaves the shell usable with the agent in the sidebar", async ({
  page,
}) => {
  await page.goto("/");
  await createFromScratch(page, "Cirrus");

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
  const runs = dialog.locator("[data-tutorial-target='createAgentBrief']");
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
