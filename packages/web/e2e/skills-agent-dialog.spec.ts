import { expect, test } from "./support/fixtures";

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
  await page.locator('[data-tour-target="tab-skills"]').click();
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
