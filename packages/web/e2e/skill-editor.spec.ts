import { expect, test } from "./support/fixtures";
import { openAgentSkills, seedAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

test("the Skills section opens a skill in its editor, switches how it reads, and comes back", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await page.goto("/");

  await openAgentSkills(page);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();

  await screen(page)
    .getByRole("button", { name: /^Invoice triage\b/ })
    .click();

  const editor = page.getByTestId("skill-editor");
  await expect(
    editor.getByRole("heading", { name: "Invoice triage", level: 2 }),
  ).toBeVisible();

  const views = editor.getByRole("tablist", {
    name: "How to view this skill",
  });
  const workflowView = views.getByRole("tab", { name: "Workflow" });
  const textView = views.getByRole("tab", { name: "Text" });
  await expect(workflowView).toBeVisible();
  await expect(textView).toBeVisible();

  await textView.click();
  const markdown = editor.getByLabel("Instructions for the AI Employee");
  await expect(markdown).toBeVisible();
  await expect(textView).toHaveAttribute("aria-selected", "true");

  await workflowView.click();
  await expect(workflowView).toHaveAttribute("aria-selected", "true");
  await expect(markdown).toHaveCount(0);
  await expect(
    editor.getByText("This skill has no step-by-step workflow yet"),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Back to skills" }).click();
  await expect(page.getByTestId("skill-editor")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeVisible();
});
