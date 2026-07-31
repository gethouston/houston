import { expect, test } from "./support/fixtures";

/**
 * The skills surfaces must render without React integrity errors. Guards two
 * regressions this branch fixed: interactive buttons passed through
 * CatalogRow's `trailing` slot (which renders INSIDE the row's <button> —
 * nested buttons corrupt the DOM tree and break clicking), and the sidebar's
 * activity-cache subscription re-rendering synchronously from another
 * component's render (setState-in-render).
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

  // Seed a shared skill so the "From your workspace" rows render.
  await request.post(`${fakeHost.url}/v1/workspaces/default/shared-skills`, {
    data: {
      name: "meeting-prep",
      description: "Prep before meetings",
      content:
        '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
    },
  });

  await page.goto("/");
  await page.locator('[data-tour-target="tab-job-description"]').click();
  await page
    .getByLabel("Agent settings")
    .getByRole("button", { name: "Skills" })
    .click();
  await page.getByRole("tab", { name: "Custom skills" }).click();
  await expect(page.getByText("From your workspace")).toBeVisible();

  await page
    .getByRole("button", { name: "Skills", exact: true })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: "Custom skills" })).toBeVisible();

  const react = errors.filter(
    (e) =>
      e.includes("Cannot update a component") ||
      e.includes("cannot be a descendant") ||
      e.includes("cannot contain a nested"),
  );
  expect(react).toEqual([]);
});
