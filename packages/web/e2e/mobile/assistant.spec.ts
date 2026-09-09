import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { navBar, openMoreMenu } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The assistant on the phone: a chat, so a PUSH like the mission chat rather
 * than a screen under the tab bar. The floating nav bar leaves while it is up
 * so the composer sits on the bottom edge and the header's own back chevron
 * is the way out.
 */

async function openPhoneAssistant(page: Page): Promise<Locator> {
  const menu = await openMoreMenu(page);
  await menu.getByRole("button", { name: "Houston" }).tap();
  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible();
  return chat;
}

test("opens from More as a full-height chat with no nav bar under it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(navBar(page)).toBeVisible();

  const chat = await openPhoneAssistant(page);
  await expect(chat.getByText("Hi, I'm Houston")).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);

  // The composer is the last thing on the screen: nothing sits below it.
  const composer = chat.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  const composerBottom = await composer.evaluate((el) => {
    const form = el.closest("form") ?? el;
    return form.getBoundingClientRect().bottom;
  });
  const lowestControl = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll("button")]
        .filter((b) => b.getClientRects().length > 0)
        .map((b) => b.getBoundingClientRect().bottom),
    ),
  );
  // The composer's own toolbar row (mode, model) sits directly under the
  // field, but no separate chrome does.
  expect(lowestControl - composerBottom).toBeLessThan(60);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the header's back chevron leaves for the Agents tab", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneAssistant(page);

  // A More-menu destination is a tab ROOT (the menu navigates with `reset`),
  // so there is nothing behind the chat to pop: back goes home.
  await page.getByTestId("assistant-back").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navBar(page)).toBeVisible();
});
