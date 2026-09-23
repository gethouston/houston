import { expect, test } from "./support/fixtures";
import { openSkillsLibrary } from "./support/settings-nav";
import { seedAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

/**
 * The shared Skills library's full-page EDITOR: one skill, read two ways.
 *
 * The library row opens the skill IN PLACE of the list (no modal), and the
 * editor's header carries the Workflow / Text switch — the one control that
 * decides whether a non-technical owner reads their skill as numbered steps or
 * as the markdown behind them. A skill written as plain instructions has no
 * parsed workflow, so its Workflow view says so and offers the way across
 * rather than showing an empty panel; the Text view is always the real
 * SKILL.md in an editable field.
 *
 * The editor's own back arrow (under the tab cluster, not a browser step) is
 * what returns the list, because the editor replaced it.
 */

test("the library opens a skill in its editor, switches how it reads, and comes back", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await page.goto("/");

  // The rail's Skills row: the shared library's one door.
  await openSkillsLibrary(page);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Invoice triage\b/ }).click();

  // The row opened the skill's own page in place of the list.
  const editor = page.getByTestId("skill-editor");
  await expect(
    editor.getByRole("heading", { name: "Invoice triage", level: 1 }),
  ).toBeVisible();

  // The header's switch: the skill's two readings, never both at once.
  const views = editor.getByRole("tablist", {
    name: "How to view this skill",
  });
  const workflowView = views.getByRole("tab", { name: "Workflow" });
  const textView = views.getByRole("tab", { name: "Text" });
  await expect(workflowView).toBeVisible();
  await expect(textView).toBeVisible();

  // Text: the SKILL.md itself, editable.
  await textView.click();
  const markdown = editor.getByLabel("Instructions for the AI Employee");
  await expect(markdown).toBeVisible();
  await expect(textView).toHaveAttribute("aria-selected", "true");

  // Workflow: the steps, or — for a skill written as plain instructions — the
  // notice that points back at the text. Either way the markdown field is
  // gone, which is what proves the views really swapped.
  await workflowView.click();
  await expect(workflowView).toHaveAttribute("aria-selected", "true");
  await expect(markdown).toHaveCount(0);
  // The seeded skill carries no Houston workflow marker, so the Workflow view
  // must show its empty state rather than a step list.
  await expect(
    editor.getByText("This skill has no step-by-step workflow yet"),
  ).toBeVisible();

  // Back to the library list: the editor is gone and the list is on the glass.
  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(page.getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();
});
