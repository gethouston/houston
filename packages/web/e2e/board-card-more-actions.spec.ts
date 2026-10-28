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

/**
 * The board answers bare Enter (open the highlighted mission) and the arrows
 * (move the highlight) on window while the chat is closed. A key that presses
 * or opens a card control must stay with that control. With three columns the
 * actions only fold while the chat is open; a board with more columns folds
 * them with it closed, which a style stands in for here by holding every
 * column at its 180px minimum.
 */
test.describe("keys on a card's controls", () => {
  async function highlightFirstCard(page: Page) {
    await page.goto("/");
    await page.addStyleTag({
      content: "[data-kanban-column] { max-width: 180px; }",
    });
    await expect(
      page.locator('[data-kanban-card="act-2"]').getByRole("button", {
        name: "More actions",
      }),
    ).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const highlighted = page.locator("[data-highlighted]");
    await expect(highlighted).toHaveCount(1);
    return highlighted.getAttribute("data-kanban-card");
  }

  test("Enter, Space and ArrowDown on More actions only open the menu", async ({
    page,
  }) => {
    const highlightedId = await highlightFirstCard(page);
    const more = page
      .locator('[data-kanban-card="act-2"]')
      .getByRole("button", { name: "More actions" });
    for (const key of ["Enter", "Space", "ArrowDown"]) {
      await more.focus();
      await page.keyboard.press(key);
      await expect(page.getByRole("menu"), key).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(
        page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER),
        key,
      ).toHaveCount(0);
      await expect(page.locator("[data-highlighted]"), key).toHaveAttribute(
        "data-kanban-card",
        highlightedId ?? "",
      );
    }
  });

  test("Enter on the status action only runs it", async ({ page }) => {
    await highlightFirstCard(page);
    await page
      .locator('[data-kanban-card="act-1"]')
      .getByRole("button", { name: "Move to done" })
      .press("Enter");
    // Moved to Done, where the card's status action is archive.
    await expect(
      page
        .locator('[data-kanban-card="act-1"]')
        .getByRole("button", { name: "Archive" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  });

  test("arrows on a plain card action still move the board highlight", async ({
    page,
  }) => {
    await page.goto("/");
    await page.addStyleTag({
      content: "[data-kanban-column] { max-width: 180px; }",
    });
    await page
      .locator('[data-kanban-card="act-2"]')
      .getByRole("button", { name: "Archive" })
      .focus();
    await expect(page.locator("[data-highlighted]")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-highlighted]")).toHaveCount(1);
  });

  test("Enter in the rename input only commits the title", async ({ page }) => {
    await highlightFirstCard(page);
    const card = page.locator('[data-kanban-card="act-2"]');
    await card.getByRole("button", { name: "More actions" }).press("Enter");
    await page.getByRole("menuitem", { name: "Change title" }).press("Enter");
    const input = card.getByRole("textbox");
    await expect(input).toBeFocused();
    await input.fill("Launch note");
    await input.press("Enter");
    await expect(card.getByText("Launch note")).toBeVisible();
    await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  });
});
