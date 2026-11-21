import { expect, test } from "./support/fixtures";
import {
  changeAnswer,
  managerOnboarding,
  reachTeamStep,
} from "./support/manager-onboarding";
import {
  ADDED_ROLE,
  addStarterCard,
  employeeNameField,
  finishOnboarding,
  hireStarterTeam,
  removeStarterCard,
  STARTER_ROLES,
  starterTeam,
} from "./support/manager-team";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";
import { agentRow, openAgentScreen, screen } from "./support/team-nav";

test("the team step opens on the starter team, hired in one press", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);

  await expect(managerOnboarding(page).getByRole("radio")).toHaveCount(0);
  await expect(starterTeam(page)).toBeVisible();

  await hireStarterTeam(page, null, "click", STARTER_ROLES);
  await expect(changeAnswer(page)).toHaveCount(0);
  await finishOnboarding(page);
  for (const name of STARTER_ROLES)
    await expect(agentRow(page, name)).toBeVisible();

  await openAgentScreen(page, STARTER_ROLES[0]);
  await expect(
    screen(page).getByRole("button", {
      name: `Start ${STARTER_ROLES[0]}'s first day`,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(agentRow(page, STARTER_ROLES[0])).toBeVisible();
  await expect(managerOnboarding(page)).toHaveCount(0);
});

test("Hire one more adds a card, Remove lets one go, and the team hired is the one shown", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  const step = starterTeam(page);

  await addStarterCard(page);
  await expect(step.getByRole("textbox", { name: /^Name / })).toHaveCount(4);

  await removeStarterCard(page, STARTER_ROLES[1]).click();
  await expect(employeeNameField(step, STARTER_ROLES[1])).toHaveCount(0);
  await expect(step.getByRole("textbox", { name: /^Name / })).toHaveCount(3);

  const team = [ADDED_ROLE, STARTER_ROLES[0], STARTER_ROLES[2]];
  await hireStarterTeam(page, null, "click", team);
  await finishOnboarding(page);
  for (const name of team) await expect(agentRow(page, name)).toBeVisible();
  await expect(agentRow(page, STARTER_ROLES[1])).toHaveCount(0);
});
