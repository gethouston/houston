import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { readSidebarLayout, seedSidebarLayout } from "./support/sidebar-layout";

test("root employees align with folder headers", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [{ id: "empty", name: "Empty", collapsed: false, agentIds: [] }],
    order: [
      { kind: "agent", id: SEED_AGENT_ID },
      { kind: "group", id: "empty" },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await expect(rail.locator("[data-sidebar-item]").first()).toContainText(
    "Houston",
  );
  await expect(
    rail.locator('[data-sidebar-group-header="empty"]'),
  ).toBeVisible();
  expect((await readSidebarLayout(page.request)).order).toEqual([
    { kind: "agent", id: SEED_AGENT_ID },
    { kind: "group", id: "empty" },
  ]);
  const rootLead = await rowLead(
    rail.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
  );
  const folderLead = await rowLead(
    rail.locator('[data-sidebar-group-header="empty"]'),
  );
  expect(rootLead).toBe(folderLead);
});

/**
 * A row's label. Depth is padding INSIDE the full-width row button, so the
 * indent reads off where the label starts, never off the button's box.
 */
/**
 * The x of a row's leading mark (avatar or group glyph): rows share one left
 * edge, while the label after it moves with the mark's width.
 */
async function rowLead(row: Locator): Promise<number> {
  return row
    .getByRole("button")
    .first()
    .evaluate(
      (button) => button.firstElementChild?.getBoundingClientRect().x ?? -1,
    );
}

async function addAgent(page: Page, name: string) {
  const response = await page.request.post(`${FAKE_HOST_URL}/agents`, {
    data: { name },
  });
  expect(response.ok()).toBe(true);
  const agent = (await response.json()) as { id: string };
  return agent.id;
}

/**
 * Press on `source`, travel to the middle of `target`, then `dx` px sideways
 * (positive = one level into a group per 20px, negative = out), and release.
 *
 * Both boxes are read only once the row is STABLE (a trial hover): rows glide
 * into their new slots for a moment after a drop, and a box read mid-glide
 * presses beside the row's real position, so the drop lands a slot away.
 */
async function dragOnto(page: Page, source: Locator, target: Locator, dx = 0) {
  await source.hover({ trial: true });
  const start = await source.boundingBox();
  if (!start) throw new Error("drag source is not visible");
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, start.y + start.height / 2 + 6, { steps: 4 });
  const end = await target.boundingBox();
  if (!end) throw new Error("drag target is not visible");
  await page.mouse.move(x, end.y + end.height / 2, { steps: 8 });
  if (dx !== 0)
    await page.mouse.move(x + dx, end.y + end.height / 2, { steps: 4 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test("reorders employees inside a group and in the top section", async ({
  page,
}) => {
  const grouped = await addAgent(page, "Grouped");
  const ungrouped = await addAgent(page, "Ungrouped");
  const last = await addAgent(page, "Last");
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "first",
        name: "First",
        collapsed: false,
        agentIds: [SEED_AGENT_ID, grouped],
      },
    ],
    order: [
      { kind: "agent", id: ungrouped },
      { kind: "group", id: "first" },
      { kind: "agent", id: last },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${grouped}"]`),
    rail.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
  );
  await expect
    .poll(
      async () => (await readSidebarLayout(page.request)).groups[0]?.agentIds,
    )
    .toEqual([grouped, SEED_AGENT_ID]);
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${last}"]`),
    rail.locator(`[data-sidebar-item][data-item-id="${ungrouped}"]`),
  );
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "agent", id: last },
      { kind: "agent", id: ungrouped },
      { kind: "group", id: "first" },
    ]);
  await page.reload();
  await expect(
    rail.locator('[data-sidebar-member-of="first"]').first(),
  ).toHaveAttribute("data-item-id", grouped);
  await expect(
    rail.locator(`[data-sidebar-item][data-item-id="${last}"]`),
  ).toHaveAttribute("data-item-id", last);
});

test("moves employees between groups and into a collapsed group dragged right", async ({
  page,
}) => {
  const second = await addAgent(page, "Second");
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "first",
        name: "First",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
      { id: "second", name: "Second", collapsed: false, agentIds: [second] },
      { id: "closed", name: "Closed", collapsed: true, agentIds: [] },
    ],
    order: [],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
    rail.locator(`[data-sidebar-item][data-item-id="${second}"]`),
  );
  await expect
    .poll(
      async () => (await readSidebarLayout(page.request)).groups[1]?.agentIds,
    )
    .toEqual([second, SEED_AGENT_ID]);
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${second}"]`),
    rail.locator('[data-sidebar-group-header="closed"]'),
    24,
  );
  await expect
    .poll(
      async () => (await readSidebarLayout(page.request)).groups[2]?.agentIds,
    )
    .toEqual([second]);
});

test("moves a grouped employee into the top section at its drop position", async ({
  page,
}) => {
  const top = await addAgent(page, "Top");
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "first",
        name: "First",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
    ],
    order: [{ kind: "agent", id: top }],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
    rail.locator(`[data-sidebar-item][data-item-id="${top}"]`),
  );
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "agent", id: SEED_AGENT_ID },
      { kind: "agent", id: top },
      { kind: "group", id: "first" },
    ]);
});

test("reorders folder headers without changing their employees", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "first",
        name: "First",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
      { id: "second", name: "Second", collapsed: false, agentIds: [] },
    ],
    order: [
      { kind: "group", id: "first" },
      { kind: "group", id: "second" },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await dragOnto(
    page,
    rail.locator('[data-sidebar-group-header="second"]'),
    rail.locator('[data-sidebar-group-header="first"]'),
  );
  await expect
    .poll(async () =>
      (await readSidebarLayout(page.request)).order.map((entry) => entry.id),
    )
    .toEqual(["second", "first"]);
  const { groups } = await readSidebarLayout(page.request);
  expect(groups.find((group) => group.id === "first")?.agentIds).toEqual([
    SEED_AGENT_ID,
  ]);
});

test("interleaves root employees and folders and reorders either kind", async ({
  page,
}) => {
  const rootA = await addAgent(page, "Root A");
  const rootB = await addAgent(page, "Root B");
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "g1", name: "One", collapsed: false, agentIds: [SEED_AGENT_ID] },
      { id: "g2", name: "Two", collapsed: false, agentIds: [] },
    ],
    order: [
      { kind: "group", id: "g1" },
      { kind: "agent", id: rootA },
      { kind: "group", id: "g2" },
      { kind: "agent", id: rootB },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  await expect(rail.locator("[data-sidebar-root-list]")).toHaveCount(1);
  const rootLead = await rowLead(
    rail.locator(`[data-sidebar-item][data-item-id="${rootA}"]`),
  );
  const folderLead = await rowLead(
    rail.locator('[data-sidebar-group-header="g1"]'),
  );
  const memberLead = await rowLead(
    rail.locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`),
  );
  expect(rootLead).toBe(folderLead);
  expect(memberLead).toBeGreaterThan(rootLead);

  await dragOnto(
    page,
    rail.locator('[data-sidebar-group-header="g2"]'),
    rail.locator(`[data-sidebar-item][data-item-id="${rootA}"]`),
  );
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "group", id: "g1" },
      { kind: "group", id: "g2" },
      { kind: "agent", id: rootA },
      { kind: "agent", id: rootB },
    ]);
  await dragOnto(
    page,
    rail.locator(`[data-sidebar-item][data-item-id="${rootB}"]`),
    rail.locator('[data-sidebar-group-header="g1"]'),
  );
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "agent", id: rootB },
      { kind: "group", id: "g1" },
      { kind: "group", id: "g2" },
      { kind: "agent", id: rootA },
    ]);
});

test("Alt+ArrowDown moves a root employee past a folder", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [{ id: "g", name: "Work", collapsed: false, agentIds: [] }],
    order: [
      { kind: "agent", id: SEED_AGENT_ID },
      { kind: "group", id: "g" },
    ],
  });
  await page.goto("/");
  const employee = page.locator(
    `[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"] button[title="Houston"]`,
  );
  await employee.focus();
  await employee.press("Alt+ArrowDown");
  await expect(employee).toBeFocused();
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "group", id: "g" },
      { kind: "agent", id: SEED_AGENT_ID },
    ]);
});

test("a drop lands where the ghost is: top level by default, inside when dragged right", async ({
  page,
}) => {
  const b = await addAgent(page, "B");
  const c = await addAgent(page, "C");
  await seedSidebarLayout(page.request, {
    groups: [{ id: "g", name: "Folder", collapsed: true, agentIds: [] }],
    order: [
      { kind: "agent", id: SEED_AGENT_ID },
      { kind: "agent", id: b },
      { kind: "group", id: "g" },
      { kind: "agent", id: c },
    ],
  });
  await page.goto("/");
  const rail = page.locator("[data-tour-target='agents']");
  const employee = rail.locator(
    `[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`,
  );
  const header = rail.locator('[data-sidebar-group-header="g"]');
  await dragOnto(page, employee, rail.locator(`[data-item-id="${c}"]`));
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "agent", id: b },
      { kind: "group", id: "g" },
      { kind: "agent", id: c },
      { kind: "agent", id: SEED_AGENT_ID },
    ]);
  await dragOnto(page, employee, header);
  await expect
    .poll(async () => (await readSidebarLayout(page.request)).order)
    .toEqual([
      { kind: "agent", id: b },
      { kind: "agent", id: SEED_AGENT_ID },
      { kind: "group", id: "g" },
      { kind: "agent", id: c },
    ]);
  await dragOnto(page, employee, employee, 24);
  await expect
    .poll(
      async () => (await readSidebarLayout(page.request)).groups[0]?.agentIds,
    )
    .toEqual([]);
  await dragOnto(page, employee, header, 24);
  await expect
    .poll(
      async () => (await readSidebarLayout(page.request)).groups[0]?.agentIds,
    )
    .toEqual([SEED_AGENT_ID]);
});
