import { expect, test } from "./support/fixtures";
import { openAgentSettings } from "./support/team-nav";

/**
 * The per-agent skill dialog is scoped to THAT agent: no "Agents with this
 * skill" section (cross-agent assignment lives only on the global Skills
 * page), while the global page's dialog keeps the section. Guards the split
 * so the per-agent surface can never quietly grow workspace-wide side
 * effects again.
 */
test("per-agent skill dialog hides cross-agent assignment; global keeps it", async ({
  page,
}) => {
  await page.goto("/");

  // Install a skill on the seeded agent via the GitHub flow (the fake host
  // returns a canned dozen for any repo).
  await openAgentSettings(page, "Houston", "Skills");
  await page.getByRole("tab", { name: "Custom skills" }).click();
  await page.getByRole("button", { name: "Add skill" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("button", { name: "GitHub" }).click();
  await addDialog.getByPlaceholder("owner/repo").fill("mattpocock/skills");
  await addDialog.getByRole("button", { name: "Find skills" }).click();
  await expect(addDialog.getByText("12 skills found")).toBeVisible();
  await addDialog.getByRole("button", { name: "Install 12" }).click();
  await expect(addDialog.getByText(/Installed 12 skills/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Open an installed skill from this agent's strip: the dialog edits THIS
  // agent's copy only — no assignment section.
  await page.getByRole("button", { name: /^Repo Skill 1\b/ }).click();
  const agentDialog = page.getByRole("dialog");
  await expect(
    agentDialog.getByLabel("Instructions for the agent"),
  ).toBeVisible();
  await expect(agentDialog.getByText("Agents with this skill")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The global Skills page keeps the section for the same skill. The sidebar
  // nav anchor disambiguates it from the agent's own Skills tab.
  await page.locator('[data-tour-target="nav-skills"]').click();
  await page.getByRole("button", { name: /^Repo Skill 1\b/ }).click();
  const globalDialog = page.getByRole("dialog");
  await expect(globalDialog.getByText("Agents with this skill")).toBeVisible();
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

  await openAgentSettings(page, "Houston", "Skills");
  await page.getByRole("tab", { name: "Custom skills" }).click();
  await page.getByRole("button", { name: "Add skill" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("button", { name: "GitHub" }).click();
  await addDialog.getByPlaceholder("owner/repo").fill("mattpocock/skills");
  await addDialog.getByRole("button", { name: "Find skills" }).click();
  await expect(addDialog.getByText("12 skills found")).toBeVisible();
  await addDialog.getByRole("button", { name: "Install 12" }).click();
  await expect(addDialog.getByText(/Installed 12 skills/)).toBeVisible();
  await page.keyboard.press("Escape");

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
