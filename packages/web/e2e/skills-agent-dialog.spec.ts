import { expect, test } from "./support/fixtures";
import { openSkillsLibrary } from "./support/settings-nav";
import {
  openAgentSkills,
  seedAgentSkills,
  seedWorkspaceSkill,
} from "./support/skills-nav";
import { screen } from "./support/team-nav";

/**
 * An AI Employee's Skills section IS the workspace Skills surface, scoped to
 * that employee: the same rows, the same full-page editor with the skill's
 * chat beside it, never a modal. The ONE difference is reach — the scoped
 * editor carries no "AI Employees with this skill" section, because the
 * section it stands in already answers that question, while the library's
 * editor keeps it. Guards the split so the per-agent surface can never quietly
 * grow workspace-wide side effects.
 */
test("the agent's Skills section opens the same editor, minus cross-agent assignment", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await page.goto("/");
  await openAgentSkills(page);

  // A row opens the skill's own page IN PLACE of the section's list, with its
  // chat claiming the shell's right-hand panel beside it.
  await screen(page)
    .getByRole("button", { name: /^Invoice triage\b/ })
    .click();
  const editor = page.getByTestId("skill-editor");
  await expect(
    // Level 2 inside the rail: its section lozenge is the screen's h1.
    editor.getByRole("heading", { name: "Invoice triage", level: 2 }),
  ).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toHaveCount(0);

  // Back returns the employee's own list.
  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(page.getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();

  // The library keeps the section for the same skill. The rail's Skills row is
  // the door that disambiguates it from the employee's own.
  await openSkillsLibrary(page);
  await page.getByRole("button", { name: /^Invoice triage\b/ }).click();
  await expect(
    // The library is the screen, so here the skill's name IS the h1.
    editor.getByRole("heading", { name: "Invoice triage", level: 1 }),
  ).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toBeVisible();
});

/**
 * The scoped surface's "Create skill" is a MENU, and its second way is the one
 * the library has no use for: putting a skill the workspace already shares on
 * THIS employee. Adding is a manifest write, so the row leaves the dialog and
 * joins the employee's own list without anything being copied.
 */
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

  // The employee holds nothing yet, so the store's skill is only on offer.
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

  // The row is gone from the dialog: there is nothing left to add, so the
  // empty state takes its place.
  await expect(dialog.getByText("Nothing left to add")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // And the employee's own list now carries it.
  await expect(
    screen(page).getByRole("button", { name: /^Meeting prep\b/ }),
  ).toBeVisible();
});

/**
 * PRODUCT-1018: the editor header carries a rename pencil. Committing a new
 * name and saving writes it into the frontmatter `title:`, so the row (and
 * every other surface) re-renders with it while the slug identity stays put.
 * Escape while editing cancels the rename without leaving the editor.
 */
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

  // Escape cancels the rename, not the editor.
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

  // The editor stays on the skill it saved; the list behind it re-serves the
  // new display title.
  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(
    screen(page).getByRole("button", { name: /^Invoice magic\b/ }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: /^Meeting notes\b/ }),
  ).toHaveCount(0);
});
