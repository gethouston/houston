import type { Locator, Page } from "@playwright/test";
import { ASSISTANT_COMPOSER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import { navBar, openMoreMenu } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

async function openPhoneAssistant(page: Page): Promise<Locator> {
  await page.getByTestId("agents-home-manager").tap();
  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible();
  return chat;
}

test("opens from the Agents list as a full-height chat with no nav bar under it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(navBar(page)).toBeVisible();

  const chat = await openPhoneAssistant(page);
  await expect(
    chat.getByText("Hi, I'm Houston, your AI Manager"),
  ).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);

  const composer = chat.getByPlaceholder(ASSISTANT_COMPOSER);
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
  expect(lowestControl - composerBottom).toBeLessThan(60);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("is first in Agents and absent from More", async ({ page }) => {
  await page.goto("/");
  const manager = page.getByTestId("agents-home-manager");
  await expect(manager).toBeVisible();
  await expect(manager.locator("[data-manager-avatar]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const firstAgent = page.getByTestId("agents-home-row").first();
  await expect(firstAgent).toBeVisible();
  const managerBox = await manager.boundingBox();
  const agentBox = await firstAgent.boundingBox();
  if (!managerBox || !agentBox) throw new Error("the list is not laid out");
  expect(managerBox.y + managerBox.height).toBeLessThanOrEqual(agentBox.y + 1);

  const menu = await openMoreMenu(page);
  await expect(
    menu.getByRole("button", { name: "Connect your apps" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("button", { name: /Houston|AI Manager/ }),
  ).toHaveCount(0);
});

test("the header's back chevron leaves for the Agents tab", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneAssistant(page);

  await page.getByTestId("assistant-back").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navBar(page)).toBeVisible();
});
