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
  await expect(
    menu.getByRole("button", { name: "Integrations" }),
  ).toBeVisible();

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

  for (const label of ["Integrations", "AI Models", "Skills"]) {
    await expect(
      menu.getByRole("button", { name: label, exact: true }),
      `"${label}" should be a row of the More menu`,
    ).toBeVisible();
  }

  // Administering the space is a Settings section, reached through the gear in
  // this menu's header line — never a destination row of its own here.
  await expect(
    menu.getByRole("button", { name: "Workspace management" }),
  ).toHaveCount(0);

  // The rows carry the RAIL's own attributes, so one anchor names the same
  // destination on both breakpoints. Skills carries a test id rather than a
  // tour anchor, because the tour does not walk it.
  for (const anchor of ["nav-integrations", "nav-ai-hub", "nav-settings"]) {
    await expect(
      moreRow(page, anchor),
      `the menu should carry the "${anchor}" anchor`,
    ).toHaveCount(1);
  }
  await expect(menu.getByTestId("rail-skills")).toHaveCount(1);

  // The one help action bands the footer; it points at no screen, and the
  // guided setup it used to sit beside is gone.
  await expect(menu.getByRole("button", { name: "Guide me" })).toHaveCount(0);
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

  await moreRow(page, "nav-integrations").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute(
    "data-screen",
    "integrations-home",
  );
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
