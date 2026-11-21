import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

const SKILL = {
  name: "meeting-prep",
  description: "Prep before meetings",
  content:
    '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
};

test("a workspace skill is added to an employee and disabled again", async ({
  page,
  request,
  fakeHost,
}) => {
  const res = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(res.status()).toBe(201);

  await page.goto("/");

  await openAgentSkills(page);
  await screen(page).getByRole("button", { name: "Create skill" }).click();
  await page.getByRole("menuitem", { name: "Add an existing skill" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add Meeting prep" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  const editor = screen(page).getByTestId("skill-editor");
  await expect(
    editor.getByRole("heading", { name: "Meeting prep", level: 2 }),
  ).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toHaveCount(0);
  await expect(editor.getByText("This is the workspace version")).toBeVisible();

  const body = editor.getByLabel("Instructions for the AI Employee");
  await body.fill("---\nname: meeting-prep\n---\n# Steps v2\n");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await editor.getByRole("button", { name: "Back to skills" }).click();
  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  await expect(
    editor.getByLabel("Instructions for the AI Employee"),
  ).toHaveValue(/# Steps v2/);

  await editor.getByRole("button", { name: "More actions" }).click();
  await page
    .getByRole("menuitem", { name: "Disable for this AI Employee" })
    .click();
  await expect(screen(page).getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toHaveCount(0);
});

test("an employee's own version of a workspace skill goes only after a confirm that names it", async ({
  page,
  request,
  fakeHost,
}) => {
  const stored = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(stored.status()).toBe(201);
  const own = await request.post(
    `${fakeHost.url}/agents/${SEED_AGENT_ID}/skills`,
    {
      data: {
        name: SKILL.name,
        description: SKILL.description,
        content: "# Steps, this employee's way\n",
      },
    },
  );
  expect(own.status()).toBe(201);

  await page.goto("/");
  await openAgentSkills(page);
  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  const editor = screen(page).getByTestId("skill-editor");
  await expect(
    editor.getByText("This AI Employee has its own version"),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Use workspace version" }),
  ).toBeVisible();

  await editor.getByRole("button", { name: "More actions" }).click();
  await page
    .getByRole("menuitem", { name: "Disable for this AI Employee" })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByText("Delete this AI Employee's own version?"),
  ).toBeVisible();
  await confirm
    .getByRole("button", { name: "Disable for this AI Employee" })
    .click();

  await expect(screen(page).getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toHaveCount(0);
});

test("a workspace skill is deleted for every employee from one employee's editor", async ({
  page,
  request,
  fakeHost,
}) => {
  const stored = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(stored.status()).toBe(201);

  await page.goto("/");
  await openAgentSkills(page);
  await screen(page).getByRole("button", { name: "Create skill" }).click();
  await page.getByRole("menuitem", { name: "Add an existing skill" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add Meeting prep" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  const editor = screen(page).getByTestId("skill-editor");
  await editor.getByRole("button", { name: "More actions" }).click();
  await page
    .getByRole("menuitem", { name: "Delete for all AI Employees" })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByText(
      "This removes the skill from the workspace for every AI Employee.",
      { exact: false },
    ),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();

  await expect(screen(page).getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toHaveCount(0);
});
