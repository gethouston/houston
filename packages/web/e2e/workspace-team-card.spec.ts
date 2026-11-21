import { expect, test } from "./support/fixtures";
import {
  BASIC_TEAM_ROLES,
  basicTeamOption,
  hireOnTeamCard,
  hireYourTeamOption,
  openNewWorkspaceTeamCard,
  TEAM_CARD_INDUSTRY,
  TEAM_HIRE_ROLE,
  teamCardBriefLine,
  teamCardBriefPicker,
  teamCardNameField,
} from "./support/team-card";
import {
  agentRow,
  openAgentScreen,
  openAgentSettings,
  screen,
} from "./support/team-nav";

test("the basic team hires the three starters and closes the dialog", async ({
  page,
  request,
}) => {
  const dialog = await openNewWorkspaceTeamCard(page, request);

  await basicTeamOption(page).click();
  await expect(
    page.getByRole("heading", { name: "Meet your new team" }),
  ).toBeVisible();
  for (const role of BASIC_TEAM_ROLES) {
    await expect(teamCardNameField(page, role)).toHaveValue(role);
  }
  await expect(
    page.getByText(
      "Everything here is editable: change any name, job or color before you hire them.",
    ),
  ).toBeVisible();
  await teamCardNameField(page, "Executive assistant").fill("Ava");

  const cleared = teamCardNameField(page, "Production planner");
  await cleared.fill("");
  await expect(cleared).toHaveAttribute(
    "placeholder",
    /^e\.g\. (Ava|Production planner, Assistant 3, Jerry)$/,
  );
  await page.getByRole("button", { name: "Hire my team" }).click();
  await expect(page.getByText("Add a name to continue")).toHaveCount(1);
  await expect(cleared).toBeFocused();

  await cleared.fill("Otto");
  await page.getByRole("button", { name: "Hire my team" }).click();

  await expect(dialog).toBeHidden();
  for (const name of ["Ava", "Otto", "Production supervisor"]) {
    await expect(agentRow(page, name)).toBeVisible();
  }
  await openAgentScreen(page, "Ava");
  await expect(
    screen(page).getByRole("button", { name: "Start Ava's first day" }),
  ).toBeVisible();
});

test("a basic team card takes a new job and industry, and hires with them", async ({
  page,
  request,
}) => {
  await openNewWorkspaceTeamCard(page, request);
  await basicTeamOption(page).click();

  await teamCardBriefLine(page, "role", "Executive assistant").click();
  const rolePicker = teamCardBriefPicker(page, "role");
  await rolePicker
    .getByRole("radio", { name: "Researcher", exact: true })
    .click();
  await expect(rolePicker).toBeHidden();
  await expect(teamCardNameField(page, "Researcher")).toBeVisible();

  const industryLine = teamCardBriefLine(page, "industry", TEAM_CARD_INDUSTRY);
  await industryLine.first().focus();
  await page.keyboard.press("Enter");
  const industryPicker = teamCardBriefPicker(page, "industry");
  await expect(industryPicker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(industryPicker).toBeHidden();
  await expect(industryLine.first()).toBeFocused();

  await industryLine.first().click();
  await industryPicker
    .getByRole("textbox", { name: "Search industries" })
    .fill("Accounting");
  await industryPicker
    .getByRole("radio", { name: "Accounting", exact: true })
    .click();
  await expect(industryPicker).toBeHidden();
  await expect(teamCardBriefLine(page, "industry", "Accounting")).toBeVisible();
  await expect(teamCardBriefLine(page, "role", "Researcher")).toBeVisible();
  await expect(industryLine).toHaveCount(2);

  for (const [role, name] of [
    ["Researcher", "Ava"],
    ["Production planner", "Otto"],
    ["Production supervisor", "Felix"],
  ] as const) {
    await teamCardNameField(page, role).fill(name);
  }
  await page.getByRole("button", { name: "Hire my team" }).click();
  await expect(agentRow(page, "Ava")).toBeVisible();

  await openAgentSettings(page, "Ava");
  await expect(
    screen(page).getByRole("button", { name: /^Change role: / }),
  ).toHaveText("Researcher");
  await expect(
    screen(page).getByRole("button", { name: /^Change industry: / }),
  ).toHaveText("Accounting");
});

test("hiring one by one builds a roster, and Done closes the dialog", async ({
  page,
  request,
}) => {
  const dialog = await openNewWorkspaceTeamCard(page, request);

  await hireYourTeamOption(page).click();
  await hireOnTeamCard(page, "Pax");
  await expect(
    page.getByRole("heading", { name: "You hired your first AI Employee" }),
  ).toBeVisible();
  await expect(page.getByText("On your team", { exact: true })).toBeVisible();
  await teamCardNameField(page, TEAM_HIRE_ROLE).fill("Piper");
  await teamCardNameField(page, TEAM_HIRE_ROLE).press("Enter");

  await page.getByRole("button", { name: "Hire another" }).click();
  await hireOnTeamCard(page, "Quill");
  await expect(
    page.getByRole("heading", { name: "You hired 2 AI Employees" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(agentRow(page, "Piper")).toBeVisible();
  await expect(agentRow(page, "Quill")).toBeVisible();
});

test("a hire made one by one stays on the team when the basic team joins", async ({
  page,
  request,
}) => {
  await openNewWorkspaceTeamCard(page, request);

  await hireYourTeamOption(page).click();
  await hireOnTeamCard(page, "Pax");

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByText("You have 1 AI Employee on your team so far"),
  ).toBeVisible();
  await basicTeamOption(page).click();
  for (const [role, name] of [
    ["Executive assistant", "Ava"],
    ["Production planner", "Otto"],
    ["Production supervisor", "Felix"],
  ] as const) {
    await teamCardNameField(page, role).fill(name);
  }
  await page.getByRole("button", { name: "Hire my team" }).click();

  for (const name of ["Pax", "Ava", "Otto", "Felix"]) {
    await expect(agentRow(page, name)).toBeVisible();
  }
});
