import { expect, test } from "./support/fixtures";
import { openSkillsLibrary } from "./support/settings-nav";
import { installRepoSkills } from "./support/skills-nav";

/**
 * The per-agent skill dialog is scoped to THAT agent: no "Agents with this
 * skill" section (cross-agent assignment lives only in the shared Skills
 * library, Settings > Skills), while the library's full-page EDITOR keeps the
 * section. Guards the split so the per-agent surface can never quietly grow
 * workspace-wide side effects again — and that the library opens the editor
 * beside the skill's chat, never a modal.
 */
test("per-agent skill dialog hides cross-agent assignment; the library editor keeps it", async ({
  page,
}) => {
  await page.goto("/");

  // Install a skill on the seeded agent via the GitHub flow (the fake host
  // returns a canned dozen for any repo).
  await installRepoSkills(page);

  // Open an installed skill from this agent's strip: the dialog edits THIS
  // agent's copy only — no assignment section.
  await page.getByRole("button", { name: /^Repo Skill 1\b/ }).click();
  const agentDialog = page.getByRole("dialog");
  await expect(
    agentDialog.getByLabel("Instructions for the AI Employee"),
  ).toBeVisible();
  await expect(
    agentDialog.getByText("AI Employees with this skill"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The shared library keeps the section for the same skill. Integrations,
  // then its Skills tab: the door that disambiguates it from the agent's own.
  await openSkillsLibrary(page);
  await page.getByRole("button", { name: /^Repo Skill 1\b/ }).click();

  // The row opens the skill's own page IN PLACE of the list — no modal — with
  // its chat claiming the shell's right-hand panel beside it.
  const editor = page.getByTestId("skill-editor");
  await expect(
    editor.getByRole("heading", { name: "Repo Skill 1", level: 1 }),
  ).toBeVisible();
  await expect(editor.getByText("AI Employees with this skill")).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  // Back returns to the library list.
  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(page.getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create skill" }),
  ).toBeVisible();
});

/**
 * PRODUCT-1018: the dialog header carries a rename pencil. Committing a new
 * name and saving writes it into the frontmatter `title:`, so the row (and
 * every other surface) re-renders with it while the slug identity stays put.
 * Escape while editing cancels the rename without closing the dialog.
 */
test("rename pencil retitles a skill from the manage dialog", async ({
  page,
}) => {
  await page.goto("/");

  await installRepoSkills(page);

  await page.getByRole("button", { name: /^Repo Skill 2\b/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Rename skill" }).click();
  const input = dialog.getByRole("textbox", { name: "Rename skill" });

  // Escape cancels the rename, not the dialog.
  await input.fill("Discarded name");
  await input.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Repo Skill 2", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Rename skill" }).click();
  await input.fill("Invoice magic");
  await input.press("Enter");
  await expect(
    dialog.getByText("Invoice magic", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save changes" }).click();

  // The dialog closes on save and the strip re-serves the new display title.
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Invoice magic\b/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Repo Skill 2\b/ }),
  ).toHaveCount(0);
});
