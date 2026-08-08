import { expect, test } from "./support/fixtures";
import { openAgentSettings } from "./support/team-nav";

/**
 * "From your workspace" (ADR 0003): once a skill is shared it stops living ON
 * agents, so the Custom tab's "From your other agents" section can no longer
 * offer it — this section does. Enabling is a one-click reversible manifest
 * write (never a copy), an enabled store skill is the agent's skill and shows
 * in its "Your skills" strip, and a row opens the preview modal.
 */

const SKILL = {
  name: "meeting-prep",
  description: "Prep before meetings",
  content:
    '---\nname: meeting-prep\ntitle: "Meeting prep"\ndescription: "Prep before meetings"\n---\n# Steps\n',
};

async function openAgentCustomTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await openAgentSettings(page, "Houston", "Skills");
  await page.getByRole("tab", { name: "Custom skills" }).click();
}

test("a workspace-shared skill is one-click enabled and joins Your skills", async ({
  page,
  request,
  fakeHost,
}) => {
  const res = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(res.status()).toBe(201);

  await openAgentCustomTab(page);
  await expect(page.getByText("From your workspace")).toBeVisible();
  await expect(page.getByText("Prep before meetings")).toBeVisible();
  // Not enabled yet: no strip, no check.
  await expect(page.getByText("Your skills")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Enable Meeting prep", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Meeting prep is enabled" }),
  ).toBeVisible();

  // The enabled store skill IS the agent's skill now: the "Your skills"
  // strip appears with its row (one strip row + one section row).
  await expect(page.getByText("Your skills")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Meeting prep\b/ }),
  ).toHaveCount(2);
});

test("a workspace row opens the preview and its Enable commits", async ({
  page,
  request,
  fakeHost,
}) => {
  const res = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(res.status()).toBe(201);

  await openAgentCustomTab(page);
  await page.getByRole("button", { name: /^Meeting prep\b/ }).click();

  // The preview modal: workspace by-line, full body, Enable as the commit.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("From your workspace")).toBeVisible();
  await dialog.getByRole("button", { name: "View full instructions" }).click();
  await expect(dialog.getByText("# Steps")).toBeVisible();
  await dialog.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(dialog.getByText("Enabled")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("img", { name: "Meeting prep is enabled" }),
  ).toBeVisible();
});

test("an active workspace skill is editable and can be disabled here", async ({
  page,
  request,
  fakeHost,
}) => {
  const res = await request.post(
    `${fakeHost.url}/v1/workspaces/default/shared-skills`,
    { data: SKILL },
  );
  expect(res.status()).toBe(201);

  await openAgentCustomTab(page);
  await page
    .getByRole("button", { name: "Enable Meeting prep", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Meeting prep is enabled" }),
  ).toBeVisible();

  // The strip row opens the MANAGE dialog: editable content, Edit in chat,
  // and "Disable for this agent" instead of Delete.
  await page
    .getByRole("button", { name: /^Meeting prep\b/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const editor = dialog.getByLabel("Instructions for the agent");
  await expect(editor).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Edit in chat" }),
  ).toBeVisible();
  await expect(dialog.getByText("Agents with this skill")).toHaveCount(0);

  // A content edit saves to the ONE workspace copy.
  await editor.fill("---\nname: meeting-prep\n---\n# Steps v2\n");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Meeting prep\b/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Instructions for the agent"),
  ).toHaveValue(/# Steps v2/);

  // Disabling is reversible: the skill leaves this agent, stays in the store.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disable for this agent" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enable Meeting prep", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Your skills")).toHaveCount(0);
});
