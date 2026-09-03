import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone's Agents home (PR 4 of the responsiveness overhaul): the landing
 * screen. An attention-sorted agent list with a last-activity preview and the
 * needs-you chip, a name filter, and the drill chain — agent → its missions
 * (sectioned) → the mission's pushed chat screen — every push a nav-stack
 * level the browser back button pops in order.
 */

test("boot lands on the Agents home with previews and the needs-you chip", async ({
  page,
}) => {
  await page.goto("/");

  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  const row = page.getByTestId("agents-home-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Houston");
  // The preview line is the most recently moved mission's title.
  await expect(row).toContainText("Plan a trip to Tokyo");
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
});

test("the name filter narrows the list and owns its empty state", async ({
  page,
}) => {
  await page.goto("/");

  const filter = page.getByTestId("agents-home-filter");
  await filter.fill("hou");
  await expect(page.getByTestId("agents-home-row")).toHaveCount(1);

  await filter.fill("zzz");
  await expect(page.getByTestId("agents-home-row")).toHaveCount(0);
  await expect(page.getByText("No agents match your search")).toBeVisible();

  await filter.fill("");
  await expect(page.getByTestId("agents-home-row")).toHaveCount(1);
});

test("agent → missions → chat pushes; back pops the trail in order", async ({
  page,
}) => {
  await page.goto("/");

  // Drill into the agent: its missions screen, sectioned the way the board is.
  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  await expect(missions).toBeVisible();
  await expect(missions.getByText("Needs you")).toBeVisible();
  await expect(missions.getByText("Done")).toBeVisible();

  // Tap a mission: its chat pushes as a first-class nav level — no board in
  // between — with the same "Task:" line the desktop panel header carries.
  await missions.getByText("Plan a trip to Tokyo").tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  // Back pops the chat, landing straight on the missions screen it came from.
  await page.goBack();
  await expect(chat).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();

  // ...and one more lands on the home list.
  await page.goBack();
  await expect(page.getByTestId("agents-home")).toBeVisible();
  await expect(page.getByTestId("agent-missions-screen")).toHaveCount(0);
});

test("an agent with only active work shows no archived row; sections hide when empty", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  const missions = page.getByTestId("agent-missions-screen");
  // The seed holds a needs-you and a done mission: no Running section, no
  // archived toggle — empty sections vanish rather than render hollow.
  await expect(missions.getByText("Needs you")).toBeVisible();
  await expect(missions.getByText("Running")).toHaveCount(0);
  await expect(page.getByTestId("agent-missions-archived-toggle")).toHaveCount(
    0,
  );
});
