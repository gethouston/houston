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
  awaitAgentsHome,
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
 * Narrow-width run for the board's screen — the responsive layout is the one
 * most worth guarding against drift. At 640px this is already the phone side
 * of the one breakpoint, so what it guards is the team Tasks LIST at a width
 * the phone baselines below do not cover. Light only: the theme axis is
 * already covered full-width above, and one narrow baseline keeps the matrix
 * lean.
 */
test("board home — narrow", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");

  // Below the breakpoint boot lands on the Agents home; this baseline guards
  // the team Tasks screen's narrow layout, so open it through the Teams tree.
  await openPhoneTeamSection(page, "mission-control", "click");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  // The phone list mounts on the isMobile signal a beat after first paint —
  // anchor on its status filter so the baseline never half-renders.
  await expect(page.getByTestId("team-task-filter-trigger")).toBeVisible();

  await expect(page).toHaveScreenshot("board-narrow.png", { fullPage: true });
});

/**
 * Phone-width shell, both themes: the floating nav pill (Agents, Teams, More
 * plus the new-task control, with the needs-you badge) around the Agents home
 * — the phone's landing screen, one line per agent under its team. Nothing on
 * it carries a live clock any more, but the mask stays cheap and guards the
 * screens that do.
 */
for (const theme of THEMES) {
  test(`mobile shell — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(await awaitAgentsHome(page)).toContainText("Houston");
    await expect(navBar(page)).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-shell-${theme}.png`, {
      fullPage: true,
      mask: [page.locator("[data-relative-time]")],
    });
  });
}

/**
 * The phone team Tasks list: a team's Tasks screen at phone width — the
 * drilled back chip, title and "…" chip, the status segments, and the board's
 * sections as bands of shared task rows carrying their owning agent's helmet.
 * These rows trail an avatar rather than a clock, so no masks.
 */
for (const theme of THEMES) {
  test(`mobile team tasks — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await openPhoneTeamSection(page, "mission-control", "click");
    await expect(page.getByTestId("team-task-filter-trigger")).toBeVisible();
    await expect(page.getByText("Draft the launch email")).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`mobile-team-tasks-${theme}.png`, {
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

    await (await awaitAgentsHome(page)).click();
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
 * The per-agent task list: the drill one tap below the Agents home — the
 * drilled header (back chip, agent, task count, the "…" menu), the status
 * segments, and the board's sections as bands of shared task rows. The rows
 * carry a live relative time (the seed's timestamps are fixed but the wall
 * clock is not), so those spans are masked rather than left to drift.
 */
for (const theme of THEMES) {
  test(`mobile agent missions — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await (await awaitAgentsHome(page)).click();
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
 * home. The screen BEHIND it stays visible through the scrim, so the boot
 * anchor is that screen's own row; the relative-time mask is kept for whatever
 * else the scrim leaves showing.
 */
for (const theme of THEMES) {
  test(`mobile more menu — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(await awaitAgentsHome(page)).toContainText("Houston");
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
