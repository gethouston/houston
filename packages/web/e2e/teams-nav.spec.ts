import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettings } from "./support/settings-nav";
import { rail, screen } from "./support/team-nav";

/**
 * The destination map, driven end to end.
 *
 * Agents lost their tab shell: every "take me to agent X's <thing>" resolves to
 * a section of X's TEAM (`lib/agent-nav.ts` → `lib/open-agent.ts`). The pure
 * rules are unit-tested (`app/tests/agent-nav.test.ts`); these cover the paths
 * a user actually walks, which is where a migration that forgot to move a
 * caller shows up as a click that does nothing.
 */

/** The rail row for a team section, and whether it says "you are here". */
function sectionRow(page: Page, label: string) {
  return rail(page)
    .locator("[data-sidebar-section-row]")
    .filter({ hasText: label })
    .first();
}

test("the guided tour ends on the team's Routines, where the seeded routine is", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The tour's one entry point: Settings > Help > Guide me. It leaves Settings
  // before arming, so every anchor it spotlights is on screen.
  await openSettings(page);
  await page.getByTestId("settings-row-guide-me").click();
  await expect(page.getByText(/Tour 1 of/)).toBeVisible();

  // Walk the whole thing. Every step OPENS its destination and spotlights a
  // real anchor, so a step whose surface or anchor moved (the team section rows
  // are addressed by a composed `teamId:section` selector) stalls the counter
  // here instead of shipping as a dead spotlight.
  const total = Number(
    /Tour 1 of (\d+)/.exec(
      (await page.getByText(/Tour 1 of/).textContent()) ?? "",
    )?.[1],
  );
  expect(total).toBeGreaterThan(5);
  for (let step = 1; step < total; step++) {
    await expect(page.getByText(`Tour ${step} of ${total}`)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByText(`Tour ${total} of ${total}`)).toBeVisible();

  // Finishing ends it on the onboarding payoff: the team's Routines section,
  // not an agent tab, which no longer exists.
  await page.getByRole("button", { name: "I'll do something amazing" }).click();
  await expect(page.getByText(/Tour \d+ of/)).toHaveCount(0);

  await expect(sectionRow(page, "Routines")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    screen(page).getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
});

test("the command palette's agent jump opens that agent's team board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+KeyK");
  const search = page.getByPlaceholder("Search agents, missions, actions...");
  await expect(search).toBeVisible();
  await search.fill("Houston");
  await page.getByRole("option", { name: "Houston", exact: true }).click();

  // Not "the agent's screen" (there is none): its team's Mission Control,
  // filtered to it — so the rail lights the team's row AND the agent's.
  await expect(sectionRow(page, "Mission Control")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    rail(page)
      .locator("[data-sidebar-item]")
      .filter({ hasText: "Houston" })
      .locator("[aria-current='page']"),
  ).toHaveCount(1);
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});

test("the palette's recent missions open the mission's chat on that team board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+KeyK");
  await page
    .getByPlaceholder("Search agents, missions, actions...")
    .fill("Tokyo");
  await page.getByRole("option", { name: /Plan a trip to Tokyo/ }).click();

  // The published target (`activityPanelId`) has exactly one consumer now — the
  // cross-agent board source — and it has to be the board the nav just opened.
  // Before the cutover the per-agent board owned this; a migration that forgot
  // to move it leaves the panel shut and this red.
  await expect(sectionRow(page, "Mission Control")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Mission: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});
