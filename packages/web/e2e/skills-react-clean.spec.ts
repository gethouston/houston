import { expect, test } from "./support/fixtures";
import { openAgentSkills } from "./support/skills-nav";
import { screen } from "./support/team-nav";

test("skills surfaces render without React integrity errors", async ({
  page,
  request,
  fakeHost,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

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
  await expect(screen(page).getByText("No skills yet")).toBeVisible();

  await screen(page).getByRole("button", { name: "Create skill" }).click();
  await page.getByRole("menuitem", { name: "Create with chat" }).click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  const react = errors.filter(
    (e) =>
      e.includes("Cannot update a component") ||
      e.includes("cannot be a descendant") ||
      e.includes("cannot contain a nested"),
  );
  expect(react).toEqual([]);
});
