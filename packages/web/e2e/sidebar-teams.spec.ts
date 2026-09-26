import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { createTeam, openCreateDialog } from "./support/sidebar-create";
import { readSidebarLayout, seedSidebarLayout } from "./support/sidebar-layout";

test("ungrouped agents lead the sidebar without a team header", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [],
    order: [{ kind: "agent", id: SEED_AGENT_ID }],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await expect(rail.getByText("Your AI Employees")).toBeVisible();
  await expect(rail.locator("[data-sidebar-group-header]")).toHaveCount(0);
  await expect(rail.locator("[data-sidebar-item]")).toContainText("Houston");
});

test("one create row closes the mixed root list outside every folder", async ({
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
  const create = rail.locator("[data-sidebar-add-row]");
  await expect(create).toHaveCount(1);
  await expect(
    rail.locator("[data-sidebar-member-of] [data-sidebar-add-row]"),
  ).toHaveCount(0);
  await expect(rail.locator("[data-sidebar-add-row] button")).toHaveClass(
    /\bpl-2\b/,
  );
  await expect(
    rail.locator("[data-sidebar-member-of='work'] button").first(),
  ).toHaveClass(/\bpl-5\b/);
  const last = rail.locator("[data-sidebar-group='last']");
  expect((await create.boundingBox())?.y).toBeGreaterThan(
    (await last.boundingBox())?.y ?? 0,
  );
});

test("the create row also follows a final root employee", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [{ id: "work", name: "Work", collapsed: false, agentIds: [] }],
    order: [
      { kind: "group", id: "work" },
      { kind: "agent", id: SEED_AGENT_ID },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  const create = rail.locator("[data-sidebar-add-row]");
  const employee = rail.locator(
    `[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`,
  );
  await expect(create).toHaveCount(1);
  expect((await create.boundingBox())?.y).toBeGreaterThan(
    (await employee.boundingBox())?.y ?? 0,
  );
  await expect(create.locator("button")).toHaveClass(/\bpl-2\b/);
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
