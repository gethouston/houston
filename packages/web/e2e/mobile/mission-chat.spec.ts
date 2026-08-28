import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone's pushed mission-chat screen (PR 5 of the responsiveness
 * overhaul): a board card pushes the chat as a first-class nav level, the
 * send round-trip works on the phone viewport, and the compose flow's draft
 * chat creates its mission on first send.
 */

test("card tap pushes the chat; back returns to the board", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();
  await screen(page)
    .getByTestId("board-pager")
    .locator("[data-board-page='needs_you']")
    .tap();
  await screen(page).getByText("Plan a trip to Tokyo").tap();

  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  // The chat's own back chevron pops the level, like hardware back.
  await chat.getByTestId("mission-chat-back").tap();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
});

test("a follow-up sent from the pushed chat round-trips", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();

  const chat = page.getByTestId("mission-chat-screen");
  const composer = chat.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  await composer.fill("Also check the trains");
  await composer.press("Enter");

  // The user's bubble and the fake host's echoed reply both land in the log.
  await expect(chat.getByText("Also check the trains")).toBeVisible();
  await expect(chat.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

test("the compose draft chat creates its mission on first send", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("mobile-top-bar")
    .getByRole("button", { name: "New task" })
    .tap();

  const chat = page.getByTestId("mission-chat-screen");
  const composer = chat.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill("Book a hotel in Kyoto");
  await composer.press("Enter");

  // The draft adopted the created mission: the reply streams in, and backing
  // out lands where compose started, never on the blank draft again.
  await expect(chat.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
  await page.goBack();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
});
