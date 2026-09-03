/**
 * Visual-regression baselines for the main shell (sidebar + mission board).
 *
 * The board is Houston's home screen — the FIRST team's Tasks board (there
 * is no global board any more), with the sidebar, titlebar, and the seeded
 * missions. It is fully deterministic under the fake
 * host: two seeded missions with FIXED timestamps (state-store.ts `EPOCH`),
 * and the kanban cards render no relative time (only sort by it), so the whole
 * screen is stable. We capture it in both themes at a fixed desktop viewport,
 * plus one narrow-width run (the most important screen gets responsive
 * coverage).
 *
 * Determinism rules for this suite live in ../README.md. In short: fixed
 * viewport, `animations: "disabled"` (config-wide), a small
 * `maxDiffPixelRatio`. The board screens carry no live clock, so they need no
 * masks; the phone screens (Agents home, the per-agent missions drill) render
 * relative times against the wall clock and mask those spans.
 */
import { expect, test } from "../support/fixtures";
import {
  moreMenu,
  navBar,
  navItem,
  openPhoneTeamSection,
} from "../support/mobile-nav";
import { navRow, screen } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

for (const theme of THEMES) {
  test(`board home — ${theme}`, async ({ page }) => {
    await page.goto("/");

    // Anchor on the shell being fully painted before pinning theme + comparing.
    await expect(navRow(page, "inbox")).toBeVisible();
    await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
    await expect(page.getByText("Draft the launch email")).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`board-${theme}.png`, {
      fullPage: true,
    });
  });
}

/**
 * Narrow-width run for the board — the responsive layout is the one most worth
 * guarding against drift (the sidebar collapse / column reflow). Light only:
 * the theme axis is already covered full-width above, and one narrow baseline
 * keeps the matrix lean.
 */
test("board home — narrow", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");

  // Below the breakpoint boot lands on the Agents home; this baseline guards
  // the BOARD's narrow layout, so open it through the Teams tree.
  await openPhoneTeamSection(page, "mission-control", "click");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  // The phone chrome (pager + control row) mounts on the isMobile signal a
  // beat after first paint — anchor on it so the baseline never half-renders.
  await expect(page.getByTestId("board-pager")).toBeVisible();

  await expect(page).toHaveScreenshot("board-narrow.png", { fullPage: true });
});

/**
 * Phone-width shell, both themes: the mobile chrome (the floating nav bar with
 * its needs-you badge and compose button) over the Agents home — the phone's
 * landing screen, on the one flat background. The rows carry a live
 * relative-time label (the seed's timestamps are fixed but the wall clock is
 * not), so those spans are masked rather than left to drift the baseline.
 */
for (const theme of THEMES) {
  test(`mobile shell — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
    await expect(navBar(page)).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-shell-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

/**
 * The phone board pager: a team's Tasks screen at phone width — the drilled
 * back chip and title, the segmented control over one full-width column page,
 * the sticky control row (search, archived), the empty Running page's hint.
 * The board's cards carry no live clock, so no masks.
 */
for (const theme of THEMES) {
  test(`mobile board pager — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await openPhoneTeamSection(page, "mission-control", "click");
    await expect(page.getByTestId("board-pager")).toBeVisible();
    await expect(page.getByText("Nothing is running right now.")).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-board-pager-${theme}.png`, {
      fullPage: true,
    });
  });
}

/**
 * The pushed mission-chat screen (PR 5): a board card's chat as a full-screen
 * nav level — back chevron header, message log, composer — with both mobile
 * bars hidden. Nothing on the screen carries a live clock, and the screens
 * kept alive BEHIND the opaque overlay don't paint, so no masks (a page-wide
 * relative-time mask would stamp boxes over the covered screens' rows).
 */
for (const theme of THEMES) {
  test(`mobile mission chat — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByTestId("agents-home-row").click();
    await page
      .getByTestId("agent-missions-screen")
      .getByText("Plan a trip to Tokyo")
      .click();
    const chat = page.getByTestId("mission-chat-screen");
    await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
    await expect(chat.getByPlaceholder("Send a follow-up...")).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-mission-chat-${theme}.png`, {
      fullPage: true,
    });
  });
}

/**
 * The per-agent missions screen (PR 4 of the responsiveness overhaul): the
 * drill one tap below the Agents home — back bar, agent masthead, and the
 * board's sections as a phone list. Same relative-time mask as above.
 */
for (const theme of THEMES) {
  test(`mobile agent missions — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByTestId("agents-home-row").click();
    const missions = page.getByTestId("agent-missions-screen");
    await expect(missions.getByText("Plan a trip to Tokyo")).toBeVisible();
    // Park the pointer: the drill click leaves it hovering a mission row, and
    // a hover fill does not belong in the resting baseline.
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-agent-missions-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

/**
 * The phone's Teams tab root: every team as a tree row with its sections
 * indented under a guide line — flat, gutterless "plane" rows on the one
 * background. Nothing here renders a clock, but the mask is kept so a section
 * row that grows one later cannot silently start drifting the baseline.
 */
for (const theme of THEMES) {
  test(`mobile teams home — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await navItem(page, "teams").click();
    await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");
    await expect(
      screen(page).getByTestId("teams-home-section").first(),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-teams-home-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

/**
 * The phone's More menu: the floating card the nav bar raises, over the Agents
 * home. The screen BEHIND it stays visible through the scrim and its rows
 * carry a live relative-time label, so those spans are masked.
 */
for (const theme of THEMES) {
  test(`mobile more menu — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
    await navItem(page, "more").click();
    await expect(moreMenu(page)).toBeVisible();
    await expect(
      moreMenu(page).getByRole("button", { name: "Inbox" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-more-menu-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}
