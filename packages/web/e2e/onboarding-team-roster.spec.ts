import { expect, test } from "./support/fixtures";
import {
  buildTeamHeading,
  reachBuildTeamCard,
  resetToFirstRun,
} from "./support/onboarding";
import {
  basicTeamOption,
  hireOnTeamCard,
  hireYourTeamOption,
  TEAM_HIRE_ROLE,
  teamCardNameField,
} from "./support/team-card";
import { agentRow } from "./support/team-nav";

const SHELL = 'main[data-tour-target="main"]';

test("hiring one by one builds a roster, and Done hands over to the app", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await reachBuildTeamCard(page);

  await hireYourTeamOption(page).click();
  await hireOnTeamCard(page, "Pax");
  await expect(
    page.getByRole("heading", { name: "You hired your first AI Employee" }),
  ).toBeVisible();
  // A hire on the roster is edited in place: the rename saves on Enter.
  await expect(page.getByText("On your team", { exact: true })).toBeVisible();
  await teamCardNameField(page, TEAM_HIRE_ROLE).fill("Piper");
  await teamCardNameField(page, TEAM_HIRE_ROLE).press("Enter");

  await page.getByRole("button", { name: "Hire another" }).click();
  await hireOnTeamCard(page, "Quill");
  await expect(
    page.getByRole("heading", { name: "You hired 2 AI Employees" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(SHELL)).toBeVisible();
  await expect(agentRow(page, "Piper")).toBeVisible();
  await expect(agentRow(page, "Quill")).toBeVisible();
});

test("a reload after the first hire keeps the user on the team card", async ({
  page,
  request,
}) => {
  // Hiring flips the zero-agent first-run signal; the pending onboarding flag
  // is what holds the user on the card until they finish it.
  await resetToFirstRun(request);
  await page.goto("/");
  await reachBuildTeamCard(page);
  await hireYourTeamOption(page).click();
  await hireOnTeamCard(page, "Pax");
  // Hire moves on at once; the reload waits for the create to land.
  await expect(page.getByText("On your team", { exact: true })).toBeVisible();

  await page.reload();
  await expect(buildTeamHeading(page)).toBeVisible();
  await expect(page.locator(SHELL)).toHaveCount(0);
});

test("a hire made one by one stays on the team when the basic team joins", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await reachBuildTeamCard(page);

  await hireYourTeamOption(page).click();
  await hireOnTeamCard(page, "Pax");

  // Back from the roster is the choice, which counts the team so far.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByText("You have 1 AI Employee on your team so far"),
  ).toBeVisible();
  await basicTeamOption(page).click();
  const starters = [
    ["Executive assistant", "Ava"],
    ["Operations manager", "Otto"],
    ["Finance manager", "Felix"],
  ] as const;
  for (const [role, name] of starters) {
    await teamCardNameField(page, role).fill(name);
  }
  await page.getByRole("button", { name: "Hire my team" }).click();

  await expect(page.locator(SHELL)).toBeVisible();
  for (const name of ["Pax", "Ava", "Otto", "Felix"]) {
    await expect(agentRow(page, name)).toBeVisible();
  }
});
