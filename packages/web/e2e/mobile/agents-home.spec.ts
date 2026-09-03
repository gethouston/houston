import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone's Agents home: the landing screen. A team-grouped tree of one-line
 * agent rows with the needs-you chip, and the drill chain — agent → its task
 * list (sectioned, segment-filtered, searchable) → the task's pushed chat
 * screen — every push a nav-stack level the browser back button pops in order.
 *
 * The seed holds ONE agent in the workspace's default team, which is exactly
 * the flat case: no team header, no indent.
 */

test("boot lands on the Agents home: one flat line per agent", async ({
  page,
}) => {
  await page.goto("/");

  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  const row = page.getByTestId("agents-home-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Houston");
  // The seeded needs-you mission shows as the row's chip — the same count the
  // nav bar's Agents badge carries.
  await expect(row.getByText("1", { exact: true })).toBeVisible();

  // The rail is not rendered on the phone, so the create control rides the
  // list's own title row — carrying the rail's `newAgent` tour anchor, which
  // is what lets the guided setup ring the same step on both breakpoints.
  const newAgent = screen(page).getByTestId("agents-home-new-agent");
  await expect(newAgent).toBeVisible();
  await expect(newAgent).toHaveAttribute("aria-label", "New agent");
  await expect(newAgent).toHaveAttribute("data-tour-target", "newAgent");
  // One line: the row identifies the agent and nothing else. No task preview,
  // no relative time — that list is one tap away.
  await expect(row).not.toContainText("Plan a trip to Tokyo");
  // A single (default) team is the flat case: no team header above the rows.
  await expect(page.getByTestId("agents-home-team")).toHaveCount(0);
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
