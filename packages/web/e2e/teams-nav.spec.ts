import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openPalette } from "./support/palette";
import { litRows, rail, screen } from "./support/team-nav";

/**
 * The destination map, driven end to end.
 *
 * Agents lost their tab shell: every "take me to agent X's <thing>" resolves to
 * a section of X's TEAM (`lib/agent-nav.ts` → `lib/open-agent.ts`). The pure
 * rules are unit-tested (`app/tests/agent-nav.test.ts`); these cover the paths
 * a user actually walks, which is where a migration that forgot to move a
 * caller shows up as a click that does nothing.
 */

/**
 * The rail row for a TEAM, and whether it says "you are here".
 *
 * A block is a name and its agents now — its sections are tabs on the screen
 * the name opens — so the header is the only row that can answer the question
 * for a team. The seeded workspace has one team, the trailing default block.
 */
function teamRow(page: Page) {
  return rail(page).locator("[data-sidebar-default-header]");
}

test("the command palette's agent jump opens that agent's team board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const search = await openPalette(page);
  await search.fill("Houston");
  await page.getByRole("option", { name: "Houston", exact: true }).click();

  // Not "the agent's screen" (there is none): its team's Tasks board, filtered
  // to it. The rail fills exactly ONE row, and a narrowed board makes the AGENT
  // row the precise answer, so the team's own header steps aside.
  await expect(
    rail(page)
      .locator("[data-sidebar-item]")
      .filter({ hasText: "Houston" })
      .locator("[aria-current='page']"),
  ).toHaveCount(1);
  await expect(litRows(teamRow(page))).toHaveCount(0);
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});

test("the palette's recent missions open the mission's chat on that team board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const search = await openPalette(page);
  await search.fill("Tokyo");
  await page.getByRole("option", { name: /Plan a trip to Tokyo/ }).click();

  // The published target (`activityPanelId`) has exactly one consumer now — the
  // cross-agent board source — and it has to be the board the nav just opened.
  // Before the cutover the per-agent board owned this; a migration that forgot
  // to move it leaves the panel shut and this red.
  // Same handoff as the agent jump: the board is the mission's agent's team,
  // filtered to that agent, so the AGENT row is the one filled.
  await expect(
    rail(page)
      .locator("[data-sidebar-item]")
      .filter({ hasText: SEED_AGENT_NAME })
      .locator("[aria-current='page']"),
  ).toHaveCount(1);
  await expect(litRows(teamRow(page))).toHaveCount(0);
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

test("a team the user holds no membership in is drawn, and the palette jumps into it", async ({
  page,
}) => {
  // C13's first non-negotiable: membership of a team grants NOTHING. Every team
  // the gateway lists is one this caller may already SEE, so the destination map
  // resolving a team the caller never joined is a real destination, not a dead
  // end. Blocking the view on `joined` made this jump land on home instead.
  await page.request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, agentTeams: true, role: "user" },
  });
  await page.request.post(`${FAKE_HOST_URL}/__test__/agent-teams`, {
    data: {
      teams: [
        { id: "team-acme", name: "Acme", isDefault: true, sortOrder: 0 },
        {
          // A team of the space holding the seeded agent (and therefore its
          // seeded mission), whose only MEMBER is somebody else.
          id: "team-design",
          name: "Design",
          sortOrder: 1,
          agentIds: [SEED_AGENT_ID],
          members: [{ userId: "u-bob" }],
        },
      ],
    },
  });

  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The rail DRAWS it. Visibility is the gateway's call and it serves a member
  // only the teams they are PART OF — which includes any team holding an agent
  // the caller can see. The seeded agent carries no assignments, so a plain
  // member sees it, so Design comes back from the read, and the client has no
  // joined/unjoined split left to filter it out with. "Not joined" now means
  // exactly one thing: the caller holds no membership ROW (no Leave entry, no
  // member list) — never that the team is hidden from them.
  await expect(
    rail(page).locator('[data-sidebar-group-header="team-design"]'),
  ).toHaveCount(1);
  await expect(
    rail(page)
      .locator("[data-sidebar-item]")
      .filter({ hasText: SEED_AGENT_NAME }),
  ).toHaveCount(1);

  const search = await openPalette(page);
  await search.fill(SEED_AGENT_NAME);
  await page
    .getByRole("option", { name: SEED_AGENT_NAME, exact: true })
    .click();

  // The screen on the glass is the AGENT's own, carrying its missions...
  await expect(screen(page).locator("[data-agent-screen]")).toContainText(
    SEED_AGENT_NAME,
  );
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  // ...opened INSIDE Design, which is the whole point: the lit row is the one
  // in Design's block, not a copy of the agent under home (the first team,
  // "Acme"), which is where the joined-ness guard used to dump every one of
  // these jumps.
  await expect(
    rail(page)
      .locator('[data-sidebar-drop-section="team-design"]')
      .locator("[data-sidebar-item]")
      .locator("[aria-current='page']"),
  ).toHaveCount(1);
  await expect(
    rail(page)
      .locator("[data-sidebar-default-header]")
      .locator("[aria-current='page']"),
  ).toHaveCount(0);
});
