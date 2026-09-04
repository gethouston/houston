import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone's Agents home: the landing screen. A chat-list of agent rows —
 * large avatar (fanned into a stack when the agent holds several tasks), the
 * name, the latest task as the preview line, its time and the needs-you badge
 * — narrowed by a team selector where the workspace has more than one team,
 * and the drill chain — agent → its task list (sectioned, segment-filtered,
 * searchable) → the task's pushed chat screen — every push a nav-stack level
 * the browser back button pops in order.
 *
 * The seed holds ONE agent in the workspace's default team, so the team
 * selector is absent by default; one spec arms two teams to bring it out.
 */

test("boot lands on the Agents home: one chat-list row per agent", async ({
  page,
}) => {
  await page.goto("/");

  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  const row = page.getByTestId("agents-home-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Houston");
  // The seeded needs-you mission shows as the row's badge — the same count
  // the nav bar's Agents badge carries.
  await expect(row.getByText("1", { exact: true })).toBeVisible();
  // The preview line is the agent's latest task, the way a chat list quotes
  // the last message; the seed's two tasks share a timestamp, and the first
  // swept one wins the tie.
  await expect(row.getByTestId("agents-home-row-preview")).toHaveText(
    "Plan a trip to Tokyo",
  );
  await expect(row.locator("[data-relative-time]")).toBeVisible();
  // Two tasks inside: the avatar fans out into a stack.
  await expect(row.getByTestId("agent-avatar-stack")).toHaveAttribute(
    "data-stacked",
    "true",
  );

  // The rail is not rendered on the phone, so the create control rides the
  // list's own title row — carrying the rail's `newAgent` tour anchor, which
  // is what lets the guided setup ring the same step on both breakpoints.
  const newAgent = screen(page).getByTestId("agents-home-new-agent");
  await expect(newAgent).toBeVisible();
  await expect(newAgent).toHaveAttribute("aria-label", "New agent");
  await expect(newAgent).toHaveAttribute("data-tour-target", "newAgent");
  // A single (default) team: nothing to narrow by, so no team selector.
  await expect(page.getByTestId("agents-home-team-filter")).toHaveCount(0);
});

test("the team selector narrows the list to one team's agents", async ({
  page,
}) => {
  // A second agent with no tasks, and two server teams holding one agent each.
  const scout = (await (
    await fetch(`${FAKE_HOST_URL}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Scout" }),
    })
  ).json()) as { id: string };
  await page.request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, agentTeams: true, role: "owner" },
  });
  await page.request.post(`${FAKE_HOST_URL}/__test__/agent-teams`, {
    data: {
      teams: [
        {
          id: "team-acme",
          name: "Acme",
          isDefault: true,
          sortOrder: 0,
          agentIds: [scout.id],
        },
        {
          id: "team-design",
          name: "Design",
          sortOrder: 1,
          agentIds: ["houston-assistant"],
        },
      ],
    },
  });

  await page.goto("/");
  const rows = page.getByTestId("agents-home-row");
  // Every team by default: both agents, the one with work leading. An agent
  // with nothing yet says so on its preview line rather than going blank.
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Houston");
  await expect(rows.nth(1)).toContainText("Scout");
  await expect(rows.nth(1).getByTestId("agents-home-row-preview")).toHaveText(
    "No tasks yet",
  );
  await expect(rows.nth(1).getByTestId("agent-avatar-stack")).toHaveAttribute(
    "data-stacked",
    "false",
  );

  const filter = page.getByTestId("agents-home-team-filter");
  await expect(filter).toHaveText("All teams");
  await filter.tap();
  await page
    .locator(
      "[data-testid='agents-home-team-option'][data-team-id='team-design']",
    )
    .click();
  await expect(filter).toHaveText("Design");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Houston");

  // The choice is a preference, not a nav level: it survives the drill and
  // back, and back never has to undo it.
  await rows.tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  await page.goBack();
  await expect(filter).toHaveText("Design");
  await expect(rows).toHaveCount(1);

  await filter.tap();
  await page
    .locator("[data-testid='agents-home-team-option'][data-team-id='all']")
    .click();
  await expect(rows).toHaveCount(2);
});

test("agent → tasks → chat pushes; back pops the trail in order", async ({
  page,
}) => {
  await page.goto("/");

  // Drill into the agent: its task list, sectioned the way the board is.
  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  await expect(missions).toBeVisible();
  // The drilled header names the agent and counts its live work.
  await expect(
    missions.getByRole("heading", { name: "Houston" }),
  ).toBeVisible();
  await expect(missions.getByText("2 tasks")).toBeVisible();
  await expect(
    missions.getByRole("heading", { name: "Needs you" }),
  ).toBeVisible();
  await expect(missions.getByRole("heading", { name: "Done" })).toBeVisible();
  // The row carries the task's own description as its second line.
  await expect(
    missions.getByText("Research flights and hotels for the spring"),
  ).toBeVisible();

  // Tap a task: its chat pushes as a first-class nav level — no board in
  // between — with the same "Task:" line the desktop panel header carries.
  await missions.getByText("Plan a trip to Tokyo").tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  // Back pops the chat, landing straight on the task list it came from.
  await page.goBack();
  await expect(chat).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  // ...and one more lands on the home list.
  await page.goBack();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("the back chip retreats to the Agents home", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  await page.getByTestId("agent-missions-back").tap();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("the segmented control leaves one band standing", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  const segment = (filter: string) =>
    missions.locator(
      `[data-testid='agent-missions-filter'][data-filter='${filter}']`,
    );

  await segment("done").tap();
  await expect(missions.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(
    missions.getByRole("heading", { name: "Needs you" }),
  ).toHaveCount(0);
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(1);

  // Running holds nothing in the seed: the list says so rather than lying.
  await segment("running").tap();
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(0);
  await expect(missions.getByText("No tasks in this view")).toBeVisible();

  await segment("all").tap();
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(2);
});

test("the overflow menu reveals a search that narrows the rows", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(2);

  await page.getByTestId("agent-missions-menu").tap();
  await page.getByTestId("agent-missions-menu-search").click();
  const search = page.getByTestId("agent-missions-search");
  await expect(search).toBeVisible();

  await search.fill("tokyo");
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(1);
  await expect(missions.getByText("Plan a trip to Tokyo")).toBeVisible();

  await search.fill("zzz");
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(0);
  await expect(missions.getByText("No tasks match your search")).toBeVisible();

  // Closing the search puts every task back.
  await page.getByTestId("agent-missions-search-close").tap();
  await expect(search).toHaveCount(0);
  await expect(missions.getByTestId("agent-mission-row")).toHaveCount(2);
});

test("an agent with only active work shows no archived group", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  // The seed holds a needs-you and a done task: no Running band, no archived
  // group — an empty band vanishes rather than rendering hollow.
  await expect(
    missions.getByRole("heading", { name: "Needs you" }),
  ).toBeVisible();
  await expect(missions.getByRole("heading", { name: "Running" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("agent-missions-archived-toggle")).toHaveCount(
    0,
  );
});
