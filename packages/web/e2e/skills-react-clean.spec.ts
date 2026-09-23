import { expect, test } from "./support/fixtures";
import { openSkillsLibrary } from "./support/settings-nav";
import { openAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

/**
 * The skills surfaces must render without React integrity errors. Guards two
 * regressions this branch fixed: interactive buttons passed through
 * CatalogRow's `trailing` slot (which renders INSIDE the row's <button> —
 * nested buttons corrupt the DOM tree and break clicking), and the sidebar's
 * activity-cache subscription re-rendering synchronously from another
 * component's render (setState-in-render).
 *
 * Both scopes of the one surface are walked: an AI Employee's own Skills
 * section and the workspace library.
 */
test("skills surfaces render without React integrity errors", async ({
  page,
  request,
  fakeHost,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Seed a shared skill so the store-backed rows take part.
  await request.post(`${fakeHost.url}/v1/workspaces/default/shared-skills`, {
    data: {
      name: "meeting-prep",
      description: "Prep before meetings",
      content:
        '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
    },
  });

  await page.goto("/");
  await openAgentSkills(page);
  // The seeded skill sits in the workspace store and this employee loads none
  // of it, so its section is the empty state: the "Your skills" heading and
  // its count stand over rows, never over an absence.
  await expect(screen(page).getByText("No skills yet")).toBeVisible();

  // The shared library, reached the way a user reaches it: the rail's Skills
  // row, which disambiguates it from the agent's own Skills section.
  await openSkillsLibrary(page);
  await expect(page.getByRole("tab")).toHaveCount(0);
  // The library creates one way, so its button opens the guided chat itself.
  await page.getByRole("button", { name: "Create skill" }).click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  const react = errors.filter(
    (e) =>
      e.includes("Cannot update a component") ||
      e.includes("cannot be a descendant") ||
      e.includes("cannot contain a nested"),
  );
  expect(react).toEqual([]);
});
