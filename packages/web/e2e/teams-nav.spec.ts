import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { litRows, rail, screen } from "./support/team-nav";
import { startGuidedTour } from "./support/tour-nav";

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

test("the guided tour ends on the team's Routines, where the seeded routine is", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The tour's one entry point: "Guide me", behind the help control in the
  // rail's footer. It lands the user on home before arming, so every anchor the
  // overlay spotlights is on screen.
  await startGuidedTour(page);

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

  // The rail says which TEAM is open; the screen says which of its sections.
  await expect(litRows(teamRow(page))).toHaveCount(1);
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
  const search = page.getByPlaceholder("Search agents, tasks, actions...");
  await expect(search).toBeVisible();
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

  await page.keyboard.press("ControlOrMeta+KeyK");
  await page.getByPlaceholder("Search agents, tasks, actions...").fill("Tokyo");
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

  await page.keyboard.press("ControlOrMeta+KeyK");
  const search = page.getByPlaceholder("Search agents, tasks, actions...");
  await expect(search).toBeVisible();
  await search.fill(SEED_AGENT_NAME);
  await page
    .getByRole("option", { name: SEED_AGENT_NAME, exact: true })
    .click();

  // The board on the glass is DESIGN's, carrying the agent's missions. The
  // team's own lozenge is the screen's heading AND the jump's destination, and
  // the jump PINNED an agent — so the heading is both names, in order.
  await expect(
    screen(page).getByRole("heading", {
      level: 1,
      name: `Design ${SEED_AGENT_NAME}`,
      exact: true,
    }),
  ).toBeVisible();
  // ...and not HOME (the first team, "Acme"), which is where the joined-ness
  // guard used to dump every one of these jumps.
  await expect(
    screen(page).getByRole("heading", { level: 1, name: /^Acme/ }),
  ).toHaveCount(0);
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});
