import { FAKE_HOST_URL } from "@houston/fake-host";
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
 * AI Employees tree.
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

  // The single-player seed is below the org gate, so Admin has no row.
  await expect(menu.getByTestId("rail-admin")).toHaveCount(0);

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

  // The footer cluster holds destinations only: no help group.
  await expect(
    menu.getByRole("button", { name: "Report a problem" }),
  ).toHaveCount(0);
  await expect(menu.getByText("Help", { exact: true })).toHaveCount(0);
});

test("Admin appears in More only for an admitted caller", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await page.goto("/");
  const menu = await openMoreMenu(page);
  await expect(menu.getByTestId("rail-admin")).toHaveCount(1);
  await menu.getByTestId("rail-admin").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "admin");
});

test("the Settings row opens the settings index", async ({ page }) => {
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
