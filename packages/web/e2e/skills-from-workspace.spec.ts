import { expect, test } from "./support/fixtures";

/**
 * "From your workspace" (ADR 0003): once a skill is shared it stops living ON
 * agents, so the Custom tab's "From your other agents" section can no longer
 * offer it — this section does, and enabling is a one-click reversible
 * manifest write, never a copy.
 */
test("a workspace-shared skill is one-click enabled from the agent's Custom tab", async ({
  page,
  request,
  fakeHost,
}) => {
  // Seed a shared skill straight into the workspace store — no agent enabled.
  const res = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    {
      data: {
        name: "meeting-prep",
        description: "Prep before meetings",
        content:
          '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
      },
    },
  );
  expect(res.status()).toBe(201);

  await page.goto("/");
  await page.locator('[data-tour-target="tab-job-description"]').click();
  await page
    .getByLabel("Agent settings")
    .getByRole("button", { name: "Skills" })
    .click();
  await page.getByRole("tab", { name: "Custom skills" }).click();

  await expect(page.getByText("From your workspace")).toBeVisible();
  await expect(page.getByText("Prep before meetings")).toBeVisible();

  await page
    .getByRole("button", { name: "Enable Meeting prep", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Meeting prep is enabled" }),
  ).toBeVisible();
});
