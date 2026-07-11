import type { Page } from "@playwright/test";
import { closeActivityPanel } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

/**
 * The reworked agent self-setup flow. Creating an agent through the dialog no
 * longer opens a full-screen activation flow — instead the dialog fires the
 * agent's self-setup mission in the normal shell, switches to the board, and
 * auto-opens the chat panel on that mission
 * (`setActivityPanelId(conversationId, { forceOpen: true })`). The mission's
 * visible bubble is `agentOnboarding:setupMission.kickoff` ("Help me get set
 * up") and its board card is `setupMission.title` ("Getting set up"); the real
 * directive rides the hidden `buildPrompt` and never renders.
 *
 * There is no in-dialog "connect" step here: it appears only when the template
 * declares integrations AND the deployment serves them, and the fake host
 * advertises `integrations: []`, so a from-scratch create closes the dialog.
 */

/** Open the create dialog and make an agent from scratch (leaves the dialog to
 *  close itself and the setup-mission panel to auto-open). */
async function createFromScratch(page: Page, name: string) {
  await page.getByRole("button", { name: "New agent" }).click();
  const scratch = page.getByText("From scratch");
  await scratch.waitFor({ state: "visible" });
  await scratch.click();
  const nameField = page.getByPlaceholder("e.g. Product manager, Sales, Jerry");
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create Agent" }).click();
}

test("creating an agent auto-starts its setup mission and opens the chat", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  await createFromScratch(page, "Aurora");

  // (a) The chat panel auto-opens on the setup mission: its follow-up composer
  // (an existing conversation) and "Getting set up" title are present.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Mission: Getting set up")).toBeVisible();
});

test("the setup mission's visible user bubble shows the kickoff copy", async ({
  page,
}) => {
  await page.goto("/");
  await createFromScratch(page, "Stratus");

  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
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
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 10_000,
  });
  await closeActivityPanel(page);

  const card = page
    .locator("[data-kanban-card]")
    .filter({ hasText: "Getting set up" });
  await expect(card).toHaveCount(1);
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

test("closing the setup panel leaves the shell usable with the agent in the sidebar", async ({
  page,
}) => {
  await page.goto("/");
  await createFromScratch(page, "Cirrus");

  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 10_000,
  });

  // (c) Dismissing the panel returns to a usable shell: the sidebar carries the
  // new agent and its New-agent control is interactive again.
  await closeActivityPanel(page);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Cirrus").first()).toBeVisible();
});
