import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import {
  buildTeamHeading,
  INDUSTRY_ANSWER,
  reachBuildTeamCard,
  resetToFirstRun,
} from "./support/onboarding";
import {
  basicTeamOption,
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

/**
 * First-run's last card, "Build your team" (`onboarding/team/*`): two ways to
 * a first team, then the app. "Start with a basic team" hires the three
 * starters in one press once each has a name; "Hire your team" walks the
 * in-app hire (the survey's industry already answered, a job, a name) once per
 * AI Employee, never waiting on the create. Both paths hire into one roster, so switching keeps
 * everyone. Every hire lands with its first day PENDING: nobody starts
 * working until the user presses the board's "Start <name>'s first day".
 */

/** The workspace shell's own main region (`workspace-shell.tsx`). */
const SHELL = 'main[data-tour-target="main"]';

test("the basic team hires the three starters and hands over to the app", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await reachBuildTeamCard(page);

  await basicTeamOption(page).click();
  await expect(
    page.getByRole("heading", { name: "Meet your new team" }),
  ).toBeVisible();
  // Each starter's name starts blank and is required.
  const starters = [
    "Executive assistant",
    "Operations manager",
    "Finance manager",
  ];
  for (const role of starters) {
    await expect(teamCardNameField(page, role)).toHaveValue("");
    // Led by the job when the field has room for it whole, the examples
    // alone when it does not: never cut short.
    await expect(teamCardNameField(page, role)).toHaveAttribute(
      "placeholder",
      new RegExp(`^e\\.g\\. (Ava|${role}, Assistant 3, Jerry)$`),
    );
  }
  await teamCardNameField(page, "Executive assistant").fill("Ava");

  // Hiring with a blank name says so on that card and takes the person to it.
  await page.getByRole("button", { name: "Hire my team" }).click();
  await expect(page.getByText("Add a name to continue")).toHaveCount(2);
  await expect(teamCardNameField(page, "Operations manager")).toBeFocused();

  // The dice suggests a name; the last one is typed.
  await page.getByRole("button", { name: "Suggest a name" }).nth(1).click();
  await expect(teamCardNameField(page, "Operations manager")).not.toHaveValue(
    "",
  );
  const suggested = await teamCardNameField(
    page,
    "Operations manager",
  ).inputValue();
  await teamCardNameField(page, "Finance manager").fill("Felix");
  await page.getByRole("button", { name: "Hire my team" }).click();

  // Onboarding is over: the shell, with all three in the rail.
  await expect(buildTeamHeading(page)).toHaveCount(0);
  await expect(page.locator(SHELL)).toBeVisible();
  for (const name of ["Ava", suggested, "Felix"]) {
    await expect(agentRow(page, name)).toBeVisible();
  }

  // Their first day waits for the user: no chat opened on its own, and the
  // employee's board offers the start.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeHidden();
  await openAgentScreen(page, "Ava");
  await expect(
    screen(page).getByRole("button", { name: "Start Ava's first day" }),
  ).toBeVisible();

  // Finished is finished: a reload stays in the app.
  await page.reload();
  await expect(page.locator(SHELL)).toBeVisible();
  await expect(buildTeamHeading(page)).toHaveCount(0);
});

test("a basic team card takes a new job and industry, and hires with them", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await reachBuildTeamCard(page);
  await basicTeamOption(page).click();

  // The job line opens the hire's own role question; a chip answers it.
  await teamCardBriefLine(page, "role", "Executive assistant").click();
  const rolePicker = teamCardBriefPicker(page, "role");
  await rolePicker
    .getByRole("radio", { name: "Researcher", exact: true })
    .click();
  await expect(rolePicker).toBeHidden();
  await expect(teamCardNameField(page, "Researcher")).toBeVisible();

  // The keyboard opens the industry question and Escape hands focus back.
  const industryLine = teamCardBriefLine(page, "industry", INDUSTRY_ANSWER);
  await industryLine.first().focus();
  await page.keyboard.press("Enter");
  const industryPicker = teamCardBriefPicker(page, "industry");
  await expect(industryPicker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(industryPicker).toBeHidden();
  await expect(industryLine.first()).toBeFocused();

  // A new industry is that card's alone, and it keeps the job.
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

  const names = [
    ["Researcher", "Ava"],
    ["Operations manager", "Otto"],
    ["Finance manager", "Felix"],
  ] as const;
  for (const [role, name] of names) {
    await teamCardNameField(page, role).fill(name);
  }
  await page.getByRole("button", { name: "Hire my team" }).click();
  await expect(page.locator(SHELL)).toBeVisible();

  // The hire's job description carries the brief the card showed.
  await openAgentSettings(page, "Ava");
  await expect(
    screen(page).getByRole("button", { name: /^Change role: / }),
  ).toHaveText("Researcher");
  await expect(
    screen(page).getByRole("button", { name: /^Change industry: / }),
  ).toHaveText("Accounting");
});
