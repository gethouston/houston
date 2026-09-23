import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openSkillsLibrary } from "./support/settings-nav";
import { openAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

/**
 * A workspace-shared skill (ADR 0003) lives in the store, never on an agent:
 * an AI Employee LOADS it through its manifest, which is a reversible write
 * and never a copy. The library's editor is where a skill is put on every
 * employee; the employee's own scoped editor is where it is taken off again,
 * and a content edit from either side writes the ONE workspace copy.
 */

const SKILL = {
  name: "meeting-prep",
  description: "Prep before meetings",
  content:
    '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
};

test("a workspace skill is enabled from the library and disabled from the employee", async ({
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

  // The library lists the store's skill before any employee loads it, and its
  // editor's More actions menu is what puts it on them.
  await openSkillsLibrary(page);
  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  await screen(page)
    .getByTestId("skill-editor")
    .getByRole("button", { name: "More actions" })
    .click();
  await page
    .getByRole("menuitem", { name: "Enable for all AI Employees" })
    .click();

  // The employee's own section now lists it, and its editor carries no
  // cross-agent assignment — the section it stands in already answers that.
  await openAgentSkills(page);
  await screen(page)
    .getByRole("button", { name: /^Meeting prep\b/ })
    .click();
  const editor = screen(page).getByTestId("skill-editor");
  await expect(
    // Level 2 inside the rail: its section lozenge is the screen's h1.
    editor.getByRole("heading", { name: "Meeting prep", level: 2 }),
  ).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toHaveCount(0);
  // The scoped editor says which copy it edits: this one is the workspace's.
  await expect(editor.getByText("This is the workspace version")).toBeVisible();

  // A content edit saves to the ONE workspace copy.
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

  // Disabling is reversible: the skill leaves this employee, stays in the
  // store, and the editor returns to the employee's own list.
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
  // The same slug on the employee itself: its copy loads instead of the store
  // version, and the aggregate folds it into that row as an override.
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

  // Both acts delete that version, and neither control says so on its own.
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
