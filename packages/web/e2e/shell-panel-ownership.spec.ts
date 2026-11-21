import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openAgentSkills } from "./support/skills-nav";
import { openTeamSection, screen } from "./support/team-nav";
import { openNavRow, workspaceMenuTrigger } from "./support/workspace-menu";

test.use({ teamBoard: true });

test("leaving the team's Routines with its chat open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  await openTeamSection(page, "Routines");
  await page.getByRole("button", { name: "New routine" }).first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(page.getByText("How do you want to start?")).toBeVisible();

  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving the employee's board with a mission open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  await openTeamSection(page, "Tasks");
  await screen(page).getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving a board with the new-mission composer open still lets it reopen", async ({
  page,
}) => {
  await page.goto("/");

  await openTeamSection(page, "Tasks");
  await page.getByRole("button", { name: "New task" }).first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await openNavRow(page, "integrations");
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  await openTeamSection(page, "Tasks");
  await screen(page).getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
});

test("an employee's skill create chat lets go of the panel when the employee leaves the glass", async ({
  page,
}) => {
  await page.goto("/");

  await openAgentSkills(page);
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  await screen(page).getByRole("button", { name: "Create skill" }).click();
  const withChat = page.getByRole("menuitem", { name: "Create with chat" });
  const panel = page.getByTestId("mission-panel");
  await withChat.or(panel).first().waitFor();
  if (await withChat.isVisible()) await withChat.click();
  await expect(panel).toBeVisible();

  await openNavRow(page, "integrations");
  await expect(panel).toBeHidden();
});

test("a team's routine chat lets go of the shared panel when the team leaves the glass", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/routines`, {
    data: { name: "Morning brief", prompt: "p", schedule: "0 9 * * *" },
  });

  await page.goto("/");
  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await openTeamSection(page, "Routines");
  const row = page
    .getByTestId("routine-row")
    .filter({ hasText: "Morning brief" });
  await row.click();
  await screen(page).getByRole("button", { name: "Edit in chat" }).click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toContainText(
    "Routine: Morning brief",
    { timeout: 15_000 },
  );

  await openNavRow(page, "integrations");
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  await openTeamSection(page, "Routines");
  await expect(page.getByTestId("mission-panel")).toHaveCount(0);
  await row.click();
  await screen(page).getByRole("button", { name: "Edit in chat" }).click();
  await expect(page.getByTestId("mission-panel")).toContainText(
    "Routine: Morning brief",
    { timeout: 15_000 },
  );
});
