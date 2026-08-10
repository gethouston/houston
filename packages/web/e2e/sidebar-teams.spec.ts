import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { createTeam } from "./support/sidebar-create";
import {
  readSidebarLayout,
  type SeedSidebarLayout,
  seedSidebarLayout,
} from "./support/sidebar-layout";
import { litRows } from "./support/team-nav";

/**
 * The sidebar is a list of TEAMS. Every block — a named team and the trailing
 * DEFAULT team, which is the workspace itself — is a NAME and its AGENTS. A
 * team's sections are tabs on the screen its name opens, not four more rows of
 * rail per team.
 *
 * What this spec guards, against the REAL rail:
 *   - the default block is labelled with the WORKSPACE name (the fake host's
 *     seed workspace is `default`) and folds like any other block, while
 *     carrying none of the affordances a stored team has, because it is the
 *     container rather than a group;
 *   - the five arms of the header click: arriving from elsewhere opens the team
 *     and folds every other (an accordion, in ONE stored write); on the team
 *     you are already on it gives a pinned agent back first, then folds, then
 *     unfolds;
 *   - EXACTLY ONE row is ever filled: the block that owns the open view, or one
 *     of its agents when the board is narrowed to that agent;
 *   - an agent row carries NO needs-you count, and a FOLDED block rolls its
 *     members' waiting work up onto its header, so folding a team is the one
 *     place that count still shows in the rail;
 *   - folding the "Your teams" band takes the whole list, and survives a reload.
 *
 * Assertions are deliberately SIDEBAR-side (the row that is lit) rather than
 * about what the team view renders — the rail's contract is "say where the user
 * is", and the view has its own specs. Drag behavior lives in
 * `sidebar-dnd.spec.ts`.
 */

const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

const WORK_TEAM = "grp-work";

/**
 * A named team holding the seeded agent, written straight into the stored
 * layout the adapter reads at boot. The fold specs need a team that already
 * HOLDS something.
 */
async function seedWorkTeam(page: Page): Promise<void> {
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: WORK_TEAM,
        name: "Work",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
    ],
    ungroupedOrder: [],
  });
}

function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

/** One team's header, by the id the rail stamps on it. */
function teamHeader(page: Page, teamId: string): Locator {
  return rail(page).locator(`[data-sidebar-group-header="${teamId}"]`);
}

/**
 * The agent row that says "you are here", by agent name. Read off
 * `aria-current="page"` — the same marker a header wears — rather than a
 * Tailwind paint utility, so the assertion is about what the rail MEANS and a
 * repaint cannot break a navigation test.
 */
function litAgentRow(page: Page, name: string): Locator {
  return rail(page)
    .locator("[data-sidebar-item]")
    .filter({ hasText: name })
    .locator("[aria-current='page']");
}

/** The trailing DEFAULT block's header, and its one control: the name. */
function defaultHeader(page: Page): Locator {
  return page.locator("[data-sidebar-default-header]");
}

/** The per-workspace sidebar layout as this surface actually STORES it: against
 *  a local-profile host the adapter writes it through
 *  `PUT /v1/workspaces/:id/sidebar-layout`, so "was the fold written down?" is a
 *  question for the host. */
function storedLayout(page: Page): Promise<SeedSidebarLayout> {
  return readSidebarLayout(page.request);
}

test("the default block is the workspace, and a block is a name and its agents", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The trailing block wears the WORKSPACE's name, not an anonymous label —
  // read off the switcher rather than hard-coded, since that identity is the
  // actual invariant ("the default team is the workspace").
  const workspaceName = (
    await page.locator("[data-tour-target='spaceSwitcher']").innerText()
  ).trim();
  expect(workspaceName).not.toEqual("");
  await expect(defaultHeader(page)).toHaveCount(1);
  await expect(defaultHeader(page)).toContainText(workspaceName);
  // One control, and nothing else. On THIS backend the block is the workspace
  // itself, and nothing in the stack can rename a workspace (the adapter's
  // `renameWorkspace` is synthetic and no host route exists), so it carries no
  // "..." at all. A host that owns the teams DOES give it the one
  // "Change icon & name" entry — `agent-teams.spec.ts` holds that half.
  await expect(defaultHeader(page).getByRole("button")).toHaveCount(1);
  await expect(defaultHeader(page).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(
    defaultHeader(page).getByRole("button", { name: "Team options" }),
  ).toHaveCount(0);

  // The rail names TEAMS and nothing else: a team's destinations moved onto its
  // own screen, so no block draws a row for one.
  await expect(rail(page).locator("[data-sidebar-section-row]")).toHaveCount(0);
  await expect(rail(page).getByText("Routines")).toHaveCount(0);
  await expect(rail(page).getByText("Manage agents")).toHaveCount(0);

  // A named team DOES carry a header menu, which is the affordance the default
  // block is missing.
  await createTeam(page, "Work");
  const named = rail(page).locator("[data-sidebar-group-header]");
  await expect(named).toHaveCount(1);
  await expect(named.getByRole("button", { name: "Team options" })).toHaveCount(
    1,
  );
});

test("the rail fills exactly ONE row: the team, or one of its agents", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // Boot lands on the first team's Tasks board, so the rail opens ALREADY
  // saying where the user is — there is no global board to sit on any more, and
  // the block's header is the only row that can say it.
  await expect(litRows(defaultHeader(page))).toHaveCount(1);
  await expect(litAgentRow(page, "Houston")).toHaveCount(0);

  // Clicking an agent narrows the board to it, and that row is the more precise
  // answer to "where am I" — so the header steps aside. Two fills in one block
  // would claim the user is in two places at once.
  await rail(page).getByText("Houston", { exact: true }).click();
  await expect(litAgentRow(page, "Houston")).toHaveCount(1);
  await expect(litRows(defaultHeader(page))).toHaveCount(0);

  // Clicking the TEAM's name from a filtered board widens back to everything:
  // the name is the block's "all agents" row. The fold does not move.
  const toggle = defaultHeader(page).getByRole("button");
  await toggle.click();
  await expect(litAgentRow(page, "Houston")).toHaveCount(0);
  await expect(litRows(defaultHeader(page))).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Only THEN does the next click fold it — the pin had to be given back first.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(litRows(defaultHeader(page))).toHaveCount(1);
});

test("clicking a team you are NOT in opens it and folds every other", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: OWNER_CAPS,
  });
  await seedWorkTeam(page);
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const work = teamHeader(page, WORK_TEAM);
  const workToggle = work.getByRole("button", { name: "Work" });
  const defaultToggle = defaultHeader(page).getByRole("button");

  // Home is the first named team. Move to the default team to establish the
  // "not in Work" starting point, with both blocks open.
  await defaultToggle.click();
  await expect(litRows(defaultHeader(page))).toHaveCount(1);
  await expect(litRows(work)).toHaveCount(0);
  await expect(defaultToggle).toHaveAttribute("aria-expanded", "true");

  // Arm 1: not in this team. It opens, it unfolds, and every OTHER block folds.
  // The rail is a list of teams, and the one just asked for is the only one
  // whose members are worth the space.
  await workToggle.click();
  await expect(litRows(work)).toHaveCount(1);
  await expect(litRows(defaultHeader(page))).toHaveCount(0);
  await expect(workToggle).toHaveAttribute("aria-expanded", "true");
  await expect(defaultToggle).toHaveAttribute("aria-expanded", "false");

  // The accordion is ONE stored write, not one per team: N toggles off a single
  // click would race each other through the same optimistic cache.
  await expect
    .poll(async () => (await storedLayout(page)).defaultCollapsed)
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await storedLayout(page)).groups.find((g) => g.id === WORK_TEAM)
          ?.collapsed,
    )
    .toBe(false);
});

test("clicking the team you are already on folds it, and the screen stays", async ({
  page,
}) => {
  await seedWorkTeam(page);
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const work = teamHeader(page, WORK_TEAM);
  const toggle = work.getByRole("button", { name: "Work" });

  // Home is already this first named team and its block starts open.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rail(page).getByText("Houston", { exact: true })).toBeVisible();

  await toggle.click();

  // Everything under the header goes, and the SCREEN STAYS — deliberate, and
  // user-invoked. The header keeps the pill, so the rail is still saying where
  // the user is.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(rail(page).getByText("Houston", { exact: true })).toHaveCount(0);
  await expect(litRows(work)).toHaveCount(1);

  // Arm 4: clicking the folded team you are on unfolds it again.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rail(page).getByText("Houston", { exact: true })).toBeVisible();
  await expect(litRows(work)).toHaveCount(1);
});

test("a folded team rolls its agents' waiting work up onto its header", async ({
  page,
}) => {
  await seedWorkTeam(page);
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const work = teamHeader(page, WORK_TEAM);
  const toggle = work.getByRole("button", { name: "Work" });
  // Home is already this first named team and its block starts open.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Open, NOTHING in the block counts: an agent row shows no needs-you chip at
  // all any more (a rail says what exists and where you are, not the score),
  // and the header defers to the rows while they are on screen.
  await expect(rail(page).getByLabel(/needs? you/i)).toHaveCount(0);

  // Folded, the rows leave the rail and the header says it on their behalf —
  // the one place the count survives here, because there is nothing left to
  // read it off.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(work.getByLabel(/needs? you/i)).toHaveCount(1);
  // The seeded mission is the one waiting, so the rollup is its count.
  await expect(work.getByLabel(/needs? you/i)).toHaveText("1");
});

test("folding the Your teams band takes the whole list with it, and is remembered", async ({
  page,
}) => {
  await page.goto("/");
  const band = page.getByRole("button", { name: "Your teams" });
  await expect(band).toHaveAttribute("aria-expanded", "true");
  await expect(defaultHeader(page)).toBeVisible();

  // The LABEL is the toggle, so folding is one click on the words themselves.
  await band.click();
  await expect(band).toHaveAttribute("aria-expanded", "false");

  // Everything the band names goes: the blocks, their agents, and the "New
  // agent" row that closes the list. What is left is the band itself, which is
  // how the user gets the list back.
  await expect(defaultHeader(page)).toHaveCount(0);
  await expect(rail(page).locator("[data-sidebar-item]")).toHaveCount(0);
  await expect(rail(page).locator("[data-sidebar-add-row]")).toHaveCount(0);

  // Persisted (`teamsSectionCollapsed` in the UI store): a rail that forgets it
  // was folded on every reload is worse than one that never folded at all.
  await page.reload();
  const reloaded = page.getByRole("button", { name: "Your teams" });
  await expect(reloaded).toHaveAttribute("aria-expanded", "false");
  await expect(defaultHeader(page)).toHaveCount(0);

  // And it opens again from the same control, with the list intact.
  await reloaded.click();
  await expect(defaultHeader(page)).toBeVisible();
  await expect(rail(page).getByText("Houston", { exact: true })).toBeVisible();
});

test("the default block folds too, and that fold is written to the layout", async ({
  page,
}) => {
  await seedWorkTeam(page);
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const toggle = defaultHeader(page).getByRole("button");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Home is the first named team. The first click navigates to the default
  // team; the second folds the team the user is now on.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // The default block is not a stored group and has no id to hang a collapsed
  // flag on, so its fold rides the layout's own additive `defaultCollapsed`.
  // Asserting the stored shape (not just the redraw) is what pins that it goes
  // through the layout at all, which is why it survives anything.
  await expect
    .poll(async () => (await storedLayout(page)).defaultCollapsed)
    .toBe(true);

  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(defaultHeader(page).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
