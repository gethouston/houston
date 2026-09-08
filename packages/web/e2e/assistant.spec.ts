import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { assistantRow, openAssistant } from "./support/settings-nav";
import { openTeamSection, screen } from "./support/team-nav";

/**
 * The personal assistant: a rail row and an infinite 1-on-1 chat behind it.
 *
 * The assistant is an ORDINARY agent conversation reached at an address
 * discovery hands out (`GET /v1/assistant`), so what is worth pinning here is
 * not the chat pipeline (chat.spec.ts owns that) but the three things this
 * surface adds:
 *
 * 1. the rail row leads the unlabelled run and opens a full-window chat;
 * 2. an empty thread introduces the assistant instead of showing skill cards —
 *    a 1-on-1 chat opens on the composer, not on a menu;
 * 3. the conversation creates NO activity, so it never appears as a board card.
 *    That is the whole of "it stays out of the board, unread counts and
 *    mentions": every one of those surfaces reads activity rows.
 */

const userRow = (page: Page, text: string): Locator =>
  screen(page)
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

/** Every activity the seeded agent holds — the board's own source of cards. */
async function activityTitles(): Promise<string[]> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agents[0].id}/activities`)
  ).json()) as { items: { title: string }[] };
  return items.map((a) => a.title);
}

test("opens from the rail onto a welcoming empty chat", async ({ page }) => {
  await page.goto("/");
  await openAssistant(page);

  // The intro, not a skill showcase: what it can reach, and the promise that
  // keeps a "can do anything" agent trustworthy.
  await expect(screen(page).getByText("Hi, I'm Houston")).toBeVisible();
  await expect(
    screen(page).getByText(/ask before anything risky/),
  ).toBeVisible();
});

test("holds a conversation that never becomes a board card", async ({
  page,
}) => {
  await page.goto("/");
  const before = await activityTitles();

  await openAssistant(page);
  const composer = screen(page).getByPlaceholder("Send a follow-up...");
  await composer.fill("what can you do");
  await composer.press("Enter");

  await expect(userRow(page, "what can you do")).toBeVisible();
  await expect(screen(page).getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  // No activity was created, which is what keeps the thread off every board,
  // unread count and mention sweep.
  expect(await activityTitles()).toEqual(before);
  await openTeamSection(page, "Tasks");
  await expect(
    screen(page).getByText("what can you do", { exact: true }),
  ).toHaveCount(0);
});

test("the composer menu offers the conversation commands once there is a chat", async ({
  page,
}) => {
  await page.goto("/");
  await openAssistant(page);

  // Nothing to compact or clear before the first message, so the entries are
  // there (never a menu that changes shape under the user) but inert.
  await screen(page).getByRole("button", { name: "Attach" }).click();
  await expect(
    page.getByRole("button", { name: "Clear context" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  const composer = screen(page).getByPlaceholder("Send a follow-up...");
  await composer.fill("hello");
  await composer.press("Enter");
  await expect(screen(page).getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  await screen(page).getByRole("button", { name: "Attach" }).click();
  await expect(
    page.getByRole("button", { name: "Compact context" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Clear context" }),
  ).toBeEnabled();
});

test("the row is absent where the deployment serves no assistant", async ({
  page,
}) => {
  // The hosted gateway owns discovery, so a pod answers 501 and the app has no
  // address to open a chat at. The row must not exist rather than open a
  // broken screen, and nothing is said to the user about it.
  await page.route("**/v1/assistant", (route) =>
    route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({
        error: "the gateway serves assistant discovery, not this engine",
        code: "assistant_gateway_only",
      }),
    }),
  );
  await page.goto("/");

  // A positive signal first, so the absence below cannot pass on an unpainted
  // rail: the Agent Store row is unconditional in every deployment.
  await expect(
    page.locator("[data-tour-target='nav-agent-store']"),
  ).toBeVisible();
  await expect(assistantRow(page)).toHaveCount(0);
});
