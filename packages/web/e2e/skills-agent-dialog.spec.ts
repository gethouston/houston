import { expect, test } from "./support/fixtures";
import {
  openAgentSkills,
  seedAgentSkills,
  seedWorkspaceSkill,
} from "./support/skills-nav";
import { screen } from "./support/team-nav";

test("the agent's Skills section opens a skill's editor in place, with its chat", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await page.goto("/");
  await openAgentSkills(page);

  await screen(page)
    .getByRole("button", { name: /^Invoice triage\b/ })
    .click();
  const editor = page.getByTestId("skill-editor");
  await expect(
    editor.getByRole("heading", { name: "Invoice triage", level: 2 }),
  ).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toHaveCount(0);

  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(page.getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();
});

test("the agent's Skills section adds a workspace skill it does not have yet", async ({
  page,
  request,
}) => {
  await seedWorkspaceSkill(request, {
    name: "meeting-prep",
    title: "Meeting prep",
    description: "Prep before meetings",
  });
  await page.goto("/");
  await openAgentSkills(page);

  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toHaveCount(0);

  await screen(page).getByRole("button", { name: "Create skill" }).click();
  await page.getByRole("menuitem", { name: "Add an existing skill" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Add an existing skill" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Add Meeting prep" }).click();

  await expect(dialog.getByText("Nothing left to add")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toBeVisible();
});

test("rename pencil retitles a skill from the editor header", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await page.goto("/");
  await openAgentSkills(page);

  await screen(page)
    .getByRole("button", { name: /^Meeting notes\b/ })
    .click();
  const editor = page.getByTestId("skill-editor");
  await editor.getByRole("button", { name: "Rename skill" }).click();
  const input = editor.getByRole("textbox", { name: "Rename skill" });

  await input.fill("Discarded name");
  await input.press("Escape");
  await expect(
    editor.getByRole("heading", { name: "Meeting notes", level: 2 }),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Rename skill" }).click();
  await input.fill("Invoice magic");
  await input.press("Enter");
  await expect(
    editor.getByRole("heading", { name: "Invoice magic", level: 2 }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(
    editor.getByRole("button", { name: "Discard", exact: true }),
  ).toBeDisabled();

  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(
    screen(page).getByRole("button", { name: /^Invoice magic\b/ }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: /^Meeting notes\b/ }),
  ).toHaveCount(0);
});
