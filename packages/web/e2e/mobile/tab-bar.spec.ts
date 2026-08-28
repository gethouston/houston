import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone shell's bottom tab bar (Agents / Tasks / Settings): each tab
 * lands on its root screen, the active tab wears aria-current, and a tab
 * switch RESETS the nav stack (native tab semantics) — browser back after a
 * switch must not re-enter the old tab's trail.
 */

test("the three tabs navigate and mark the active tab", async ({ page }) => {
  await page.goto("/");
  const tabBar = page.getByTestId("mobile-tab-bar");
  await expect(tabBar).toBeVisible();

  // Boot lands on the Agents home — the phone's landing tab.
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(tabBar.getByRole("button", { name: "Agents" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The seeded needs-you mission shows as the Tasks tab's count badge.
  await expect(tabBar.getByText("1", { exact: true })).toBeVisible();

  await tabBar.getByRole("button", { name: "Settings" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(
    tabBar.getByRole("button", { name: "Settings" }),
  ).toHaveAttribute("aria-current", "page");

  await tabBar.getByRole("button", { name: "Tasks" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
  await expect(tabBar.getByRole("button", { name: "Tasks" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  // Agents roots back on the home list.
  await tabBar.getByRole("button", { name: "Agents" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(tabBar.getByRole("button", { name: "Agents" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a tab switch resets the stack: back stays on the new tab", async ({
  page,
}) => {
  await page.goto("/");

  // Drill into the full-screen chat on the Tasks tab...
  const tabBar = page.getByTestId("mobile-tab-bar");
  await tabBar.getByRole("button", { name: "Tasks" }).tap();
  await screen(page).getByText("Plan a trip to Tokyo").tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  // ...switch tabs: the chat closes and the old tab's trail is abandoned.
  await tabBar.getByRole("button", { name: "Settings" }).tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // Browser back walks a decayed pre-switch entry: it clamps onto the fresh
  // root instead of reopening the chat the user navigated away from.
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("re-tapping the Agents tab pops a drilled agent back to the list", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  // The active tab's own root: re-tapping abandons the drill.
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Agents" })
    .tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("the top bar compose button starts a new task", async ({ page }) => {
  await page.goto("/");

  await page
    .getByTestId("mobile-top-bar")
    .getByRole("button", { name: "New task" })
    .tap();
  // One connected agent: the flow skips the picker and opens the draft chat.
  await expect(page.getByTestId("mission-panel")).toBeVisible();
});
