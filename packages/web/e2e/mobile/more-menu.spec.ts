import { expect, test } from "../support/fixtures";
import {
  moreMenu,
  moreRow,
  navItem,
  openMoreMenu,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone's More menu: the card the nav bar raises for everything outside the
 * Agents and Teams trees.
 *
 * Its destinations ARE the desktop rail's (`useSidebarNavItems`), so this spec
 * guards the two things that could drift — the list the seeded single-player
 * deployment actually offers, and the rail's tour anchors resolving to these
 * rows — plus the rule that picking one closes the menu instead of leaving it
 * floating over the screen it opened.
 */

test("More opens the card and closes again without navigating", async ({
  page,
}) => {
  await page.goto("/");

  const menu = await openMoreMenu(page);
  await expect(menu.getByRole("button", { name: "Inbox" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(moreMenu(page)).toBeHidden();
  // Dismissing a menu is not a navigation: the screen behind it is untouched.
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
});

test("the menu lists what this deployment offers, with the rail's anchors", async ({
  page,
}) => {
  await page.goto("/");
  const menu = await openMoreMenu(page);

  for (const label of [
    "Inbox",
    "About me",
    "Academy",
    "Agent Store",
    "Integrations",
    "AI Models",
    "Skills",
  ]) {
    await expect(
      menu.getByRole("button", { name: label, exact: true }),
      `"${label}" should be a row of the More menu`,
    ).toBeVisible();
  }

  // Admin is the one gated row the fake host's DEFAULT capabilities refuse:
  // single-player (no `multiplayer`, no role), so `showOrganization` is false
  // and the row must not exist — a gate the phone re-derives would drift.
  await expect(menu.getByRole("button", { name: "Admin" })).toHaveCount(0);

  // The rows carry the RAIL's tour anchors, which is what lets the guided
  // setup ring the same destination on both breakpoints.
  for (const anchor of [
    "nav-inbox",
    "nav-agent-store",
    "nav-integrations",
    "nav-ai-hub",
    "nav-skills",
    "nav-settings",
  ]) {
    await expect(
      moreRow(page, anchor),
      `the menu should carry the "${anchor}" anchor`,
    ).toHaveCount(1);
  }

  // The two help actions band the footer; neither points at a screen.
  await expect(menu.getByRole("button", { name: "Guide me" })).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Report a problem" }),
  ).toBeVisible();
});

test("the Settings gear opens the settings index", async ({ page }) => {
  await page.goto("/");
  await openMoreMenu(page);

  await moreRow(page, "nav-settings").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  // The INDEX, never a leftover section: its own groups are on the glass.
  await expect(
    screen(page).getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(screen(page).getByText("General")).toBeVisible();
});

test("a destination row lands on its screen and closes the menu", async ({
  page,
}) => {
  await page.goto("/");
  await openMoreMenu(page);

  await moreRow(page, "nav-inbox").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");
  await expect(navItem(page, "more")).toHaveAttribute("aria-current", "page");
});

test("Report a problem lands on the bug-report section", async ({ page }) => {
  await page.goto("/");
  const menu = await openMoreMenu(page);

  await menu.getByRole("button", { name: "Report a problem" }).tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(
    screen(page).getByRole("heading", { name: "Report bug" }),
  ).toBeVisible();
});
