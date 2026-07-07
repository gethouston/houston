import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU-714: "New routine" → "Create it in chat". The guided setup chat opens
 * as a panel owned by the Routines tab, the agent speaks first (the Houston-
 * sent kickoff bubble never renders), and the chat never appears as a board
 * card. Left mid-interview it leaves a Continue/Discard banner; finished, it
 * cleans itself up.
 */

async function openRoutinesTab(page: import("@playwright/test").Page) {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

async function startSetupChat(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New routine" }).first().click();
  await page.getByRole("button", { name: "Create it in chat" }).click();
}

test("guided setup: the panel opens on the Routines tab and the agent speaks first", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startSetupChat(page);

  // The panel opens on the Routines tab with the mission title, still on the
  // Routines tab (no view switch).
  const panelHeader = page.getByText("Mission: Set up a new routine");
  await expect(panelHeader).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();

  // The agent's reply is the FIRST visible message — the user typed nothing.
  // (The fake host's canned reply echoes the kickoff prompt, so "no kickoff
  // bubble" can't be asserted by text here — the unit test on
  // filterAutoContinueFeedItems covers it.)
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: test.info().outputPath("setup-chat-open.png"),
  });
});

test("mid-interview: no board card, tab switch leaves a Continue banner", async ({
  page,
}) => {
  // Arm the turn to settle on an ask_user interaction — mid-interview state.
  await fetch(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "What should the routine do?",
            options: [
              { id: "email", label: "Check my email" },
              { id: "brief", label: "Morning brief" },
            ],
          },
        ],
      },
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  await startSetupChat(page);
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // No VISIBLE card on the Activity board (the setup surface's own hidden
  // list still holds the item, so assert visibility, not count).
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(
    page.getByText("Set up a new routine", { exact: true }),
  ).not.toBeVisible();

  // Back on Routines: the tab switch auto-closed the panel, and the
  // needs-you setup chat surfaces as the Continue/Discard banner.
  await openRoutinesTab(page);
  await expect(
    page.getByText("You are creating a routine in chat"),
  ).toBeVisible();

  // Continue reopens the same chat (no duplicate mission created).
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible();
});

test("finished setup chat cleans itself up after the panel closes", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startSetupChat(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // The canned turn settles "done" with no pending interaction. Leaving the
  // tab closes the panel; the finished chat archives itself — no banner, no
  // board card, nothing left behind.
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(
    page.getByText("Set up a new routine", { exact: true }),
  ).not.toBeVisible();
  await openRoutinesTab(page);
  await expect(
    page.getByText("You are creating a routine in chat"),
  ).toHaveCount(0);
});
