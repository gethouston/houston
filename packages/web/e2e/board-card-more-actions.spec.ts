/**
 * A narrow card (a 180px column: 1280 window with the chat open) folds rename
 * and delete into one always-visible "More actions" button so its time label
 * keeps room (HOU-165). Both actions must still work from that menu, without
 * opening the mission behind it, and the status action stays one click.
 */
import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

async function openChatOnNarrowBoard(page: Page) {
  await page.goto("/");
  await page.locator('[data-kanban-card="act-1"]').click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
}

test("a narrow card renames its mission from the more menu", async ({
  page,
}) => {
  await openChatOnNarrowBoard(page);
  const card = page.locator('[data-kanban-card="act-2"]');
  await expect(card.getByRole("button", { name: "Change title" })).toHaveCount(
    0,
  );
  await expect(card.getByRole("button", { name: "Archive" })).toBeVisible();

  await card.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Change title" }).click();

  const input = card.getByRole("textbox");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Draft the launch email");
  await input.fill("");
  await input.pressSequentially("Launch note");
  await input.press("Enter");

  await expect(card.getByText("Launch note")).toBeVisible();
  // The rename never opened this mission over the one already in the panel.
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
});

test("a narrow card deletes its mission from the more menu", async ({
  page,
}) => {
  await openChatOnNarrowBoard(page);
  const card = page.locator('[data-kanban-card="act-2"]');
  await card.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(card).toHaveCount(0);
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
});

test("closing the more menu returns focus to its button", async ({ page }) => {
  await openChatOnNarrowBoard(page);
  const more = page
    .locator('[data-kanban-card="act-2"]')
    .getByRole("button", { name: "More actions" });

  await more.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(more).toBeFocused();
});
