import { expect, test } from "./support/fixtures";

/**
 * The mission board is "files-first": it reads `.houston/activity/activity.json`
 * (served by the fake host's agentfile store) and groups missions into columns by
 * status. These specs prove that data path and card → chat navigation.
 */
test("renders the seeded missions on the board", async ({ page }) => {
  await page.goto("/");

  // Seeded in state.ts: one "needs_you" mission, one "done" mission.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();
});

test("opens a mission's chat when its card is clicked", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").click();

  // The mission's conversation opens (an existing mission uses the follow-up
  // composer; a brand-new conversation uses "What should the agent work on?").
  await expect(page.getByText("Mission: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/** The "Search missions" box filters the board client-side. */
test("filters the board with the search box", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();

  await page.getByPlaceholder("Search missions").fill("Tokyo");

  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toHaveCount(0);
});

/**
 * Card actions are hover-gated. Cards carry `data-kanban-card="<id>"` and columns
 * `data-kanban-column="<status>"` (act-1 = the needs_you Tokyo mission), so we can
 * scope precisely. "Move to done" writes status=done to activity.json, which the
 * board re-reads and re-columns.
 */
test("moves a mission to the Done column", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();

  // The card now lives under the Done column.
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("Plan a trip to Tokyo"),
  ).toBeVisible();
});

test("deletes a mission from the board", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-2"]'); // "Draft the launch email"
  await card.hover();
  await card.getByRole("button", { name: "Delete" }).click();

  // Confirm in the alert dialog ("Delete \"Draft the launch email\"?").
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Draft the launch email")).toHaveCount(0);
});
