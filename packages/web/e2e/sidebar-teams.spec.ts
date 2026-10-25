import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { setAccountPreference } from "./support/onboarding";
import { createTeam, openCreateDialog } from "./support/sidebar-create";
import { readSidebarLayout, seedSidebarLayout } from "./support/sidebar-layout";
import { workspaceMenuTrigger } from "./support/workspace-menu";

test("ungrouped agents lead the sidebar without a team header", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [],
    order: [{ kind: "agent", id: SEED_AGENT_ID }],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await expect(rail.locator("[data-sidebar-group-header]")).toHaveCount(0);
  await expect(rail.locator("[data-sidebar-item]")).toContainText(
    SEED_AGENT_NAME,
  );
});

test("the list closes on one Add new AI Employee shortcut, outside every folder", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "work", name: "Work", collapsed: false, agentIds: [SEED_AGENT_ID] },
      { id: "last", name: "Last", collapsed: false, agentIds: [] },
    ],
    order: [
      { kind: "group", id: "work" },
      { kind: "group", id: "last" },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await expect(rail.locator("[data-sidebar-group='last']")).toBeVisible();
  // ONE shortcut closes the list, after the last folder and outside every
  // one of them; the "+" on the top line keeps the tour's newAgent anchor.
  const addRow = rail.getByTestId("rail-add-employee");
  await expect(addRow).toHaveCount(1);
  await expect(addRow).toContainText("Add new AI Employee");
  await expect(
    rail.locator("[data-sidebar-group] [data-testid='rail-add-employee']"),
  ).toHaveCount(0);
  const lastGroupBox = await rail
    .locator("[data-sidebar-group='last']")
    .boundingBox();
  const addRowBox = await addRow.boundingBox();
  if (!lastGroupBox || !addRowBox) throw new Error("the rail is not laid out");
  expect(addRowBox.y).toBeGreaterThanOrEqual(
    lastGroupBox.y + lastGroupBox.height - 1,
  );
  await expect(
    page.locator("[data-tour-target='sidebar'] [data-tour-target='newAgent']"),
  ).toBeVisible();
  // A member steps in one level from the root rows, with no line down the
  // folder or between its members.
  const member = rail.locator("[data-sidebar-member-of='work']");
  await expect(member.locator("button").first()).toHaveClass(/\bpl-8\b/);
  await expect(member).not.toHaveClass(/after:bg-line/);
  await expect(member.locator("[data-person-text]")).not.toHaveClass(
    /border-line/,
  );
});

test("the create menu identifies employees and groups by their glyphs", async ({
  page,
}) => {
  await page.goto("/");
  await openCreateDialog(page);
  await expect(
    page
      .getByRole("menuitem", { name: "New AI Employee" })
      .locator('svg[viewBox="0 0 412.248 448.898"]'),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("menuitem", { name: "New group" })
      .locator("svg.lucide-folder-plus"),
  ).toHaveCount(1);
});

test("a new team is stored as a personal folder", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
  await createTeam(page, "Design");
  const layout = await readSidebarLayout(page.request);
  const folder = layout.groups.find((group) => group.name === "Design");
  expect(folder).toMatchObject({ collapsed: false, agentIds: [] });
  await expect(
    page.locator(`[data-sidebar-group-header="${folder?.id}"]`),
  ).toContainText("Design");
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
});

test("folder menu renames, edits identity, and deletes without deleting employees", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "design",
        name: "Design",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
    ],
    order: [],
  });
  await page.goto("/");
  const folder = page.locator('[data-sidebar-group-header="design"]');
  await folder.getByTestId("team-folder-menu").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Group name" }).fill("Studio");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(folder).toContainText("Studio");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await folder.getByTestId("team-folder-menu").click();
  await page.getByRole("menuitem", { name: "Icon & color" }).click();
  await expect(
    page.getByRole("dialog", { name: "Icon & color" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await folder.getByTestId("team-folder-menu").click();
  await page.getByRole("menuitem", { name: "Delete group" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("The AI Employees in this group stay");
  await confirm.getByRole("button", { name: "Delete group" }).click();
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).groups)
    .toHaveLength(0);
  expect((await readSidebarLayout(page.request)).order).toContainEqual({
    kind: "agent",
    id: SEED_AGENT_ID,
  });
  await expect(
    page.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
  ).toBeVisible();
});

test("folder menu launches Move to another space when spaces are available", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, spaces: true, role: "owner" },
  });
  // A move needs a destination: a team space this person owns.
  await request.post(`${FAKE_HOST_URL}/__test__/workspaces`, {
    data: { teams: [{ slug: "00000000000000ab", name: "Acme Team" }] },
  });
  // The folder lives in the personal space, the one this person last used.
  await setAccountPreference(request, "last_workspace_id", SEED_WORKSPACE_ID);
  await seedSidebarLayout(request, {
    groups: [{ id: "design", name: "Design", collapsed: false, agentIds: [] }],
    order: [{ kind: "agent", id: SEED_AGENT_ID }],
  });
  await page.goto("/");
  await page
    .locator('[data-sidebar-group-header="design"]')
    .getByTestId("team-folder-menu")
    .click();
  await page.getByRole("menuitem", { name: "Move to another space" }).click();
  await expect(page.getByRole("dialog", { name: /Move Design/ })).toBeVisible();
});

test("the list's shortcut opens the create sheet on a new AI Employee", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("[data-tour-target='agents']")
    .getByTestId("rail-add-employee")
    .click();
  // Straight onto the employee path: no choice between an employee and a
  // group, which is the top line's "+".
  await expect(page.getByRole("menuitem", { name: "New group" })).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole("button", { name: "Hire a new AI Employee" })
      .or(page.getByRole("radio", { name: "Finance", exact: true }))
      .first(),
  ).toBeVisible();
});

test("an open empty folder says how to fill it, and folding hides the line", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [{ id: "later", name: "Later", collapsed: false, agentIds: [] }],
    order: [
      { kind: "group", id: "later" },
      { kind: "agent", id: SEED_AGENT_ID },
    ],
  });
  await page.goto("/");
  const hint = page.locator('[data-sidebar-empty-group="later"]');
  await expect(hint).toHaveText("Drag an AI Employee here");
  await page
    .locator('[data-sidebar-group-header="later"] button')
    .first()
    .click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator("[data-sidebar-item]")).toContainText(
    SEED_AGENT_NAME,
  );
});
