import type { Locator, Page } from "@playwright/test";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

/**
 * Sidebar grouping + drag (Notion/Mercury-style @dnd-kit, always-on). Drives the
 * REAL sidebar and covers the regressions: multi-character group names, dragging
 * an agent INTO and back OUT of a group, and reordering top-level agents WITH a
 * group present. Everything must persist across a reload.
 */

async function center(loc: Locator) {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no bounding box");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drag `source` onto `target`, re-reading the target's live position as the
 *  list reflows during the drag (a fixed pre-drag coordinate would miss). */
async function dragOnto(page: Page, source: Locator, target: Locator) {
  const s = await center(source);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(s.x, s.y + 10, { steps: 5 }); // cross activation
  for (let i = 0; i < 3; i++) {
    const t = await center(target);
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(300); // drop-animation + overlay unmount
}

async function rowY(sidebar: Locator, name: string) {
  return (await sidebar.getByText(name, { exact: true }).boundingBox())?.y ?? 0;
}

test("group create + type name + drag in/out + top-level reorder", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your Agents")).toBeVisible();

  await createAgent(page, "Alpha");
  await createAgent(page, "Beta");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  // Folder button → group opens in rename. TYPE the name char-by-char: a
  // re-focus-and-select on every render used to eat all but the last keystroke.
  await page.getByRole("button", { name: "New group" }).click();
  const nameInput = page.getByPlaceholder("Group name");
  await nameInput.waitFor({ state: "visible" });
  await nameInput.pressSequentially("Work");
  await nameInput.press("Enter");
  await expect(header).toHaveCount(1);
  await expect(sidebar.getByText("Work")).toBeVisible(); // full name, not "k"

  // Drag "Alpha" INTO the group — a one-shot pulse confirms the drop.
  await dragOnto(page, sidebar.getByText("Alpha", { exact: true }), header);
  await expect(page.locator(".sidebar-group-dropped")).toHaveCount(1);
  await expect(header.getByText("1")).toBeVisible();

  // Drag "Alpha" back OUT of the group, onto an ungrouped agent.
  await dragOnto(
    page,
    sidebar.getByText("Alpha", { exact: true }),
    sidebar.getByText("Houston", { exact: true }),
  );
  await expect(header.getByText("0")).toBeVisible();

  // Reorder a TOP-LEVEL (ungrouped) agent while a group exists: Beta onto
  // Houston so Beta ends up above Houston.
  expect(await rowY(sidebar, "Beta")).toBeGreaterThan(
    await rowY(sidebar, "Houston"),
  );
  await dragOnto(
    page,
    sidebar.getByText("Beta", { exact: true }),
    sidebar.getByText("Houston", { exact: true }),
  );
  expect(await rowY(sidebar, "Beta")).toBeLessThan(
    await rowY(sidebar, "Houston"),
  );
});

test("dropping onto a COLLAPSED folder confirms with a pulse", async ({
  page,
}) => {
  await page.goto("/");
  await createAgent(page, "Nova");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  await page.getByRole("button", { name: "New group" }).click();
  const ni = page.getByPlaceholder("Group name");
  await ni.waitFor({ state: "visible" });
  await ni.fill("Team");
  await ni.press("Enter");
  await expect(header).toHaveCount(1);

  // Seed the group with Nova, then collapse it.
  await dragOnto(page, sidebar.getByText("Nova", { exact: true }), header);
  await expect(header.getByText("1")).toBeVisible();
  await header.getByText("Team").click();
  await expect(sidebar.getByText("Nova", { exact: true })).toHaveCount(0);

  // Drop another agent onto the COLLAPSED folder: nothing else moves visibly,
  // so the pulse is the only confirmation. Count ticks to 2.
  await dragOnto(page, sidebar.getByText("Houston", { exact: true }), header);
  await expect(page.locator(".sidebar-group-dropped")).toHaveCount(1);
  await expect(header.getByText("2")).toBeVisible();
});

test("drag an agent OUT into an empty default section (reserved slot)", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  // Put the only two agents (Houston seed + Solo) both into one group so the
  // default section is EMPTY — dragging out must use the reserved drop slot.
  await createAgent(page, "Solo");
  await page.getByRole("button", { name: "New group" }).click();
  const ni = page.getByPlaceholder("Group name");
  await ni.waitFor({ state: "visible" });
  await ni.fill("All");
  await ni.press("Enter");
  await dragOnto(page, sidebar.getByText("Solo", { exact: true }), header);
  await dragOnto(page, sidebar.getByText("Houston", { exact: true }), header);
  await expect(header.getByText("2")).toBeVisible();

  // Drag Solo down into the empty default area (below the group).
  const groupBox = await sidebar
    .locator("[data-sidebar-drop-group]")
    .first()
    .boundingBox();
  if (!groupBox) throw new Error("no group box");
  const solo = sidebar.getByText("Solo", { exact: true });
  const s = await center(solo);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(s.x, s.y + 10, { steps: 5 });
  // Aim below the whole group (the reserved default slot).
  const targetY = groupBox.y + groupBox.height + 16;
  await page.mouse.move(s.x, targetY, { steps: 15 });
  await page.waitForTimeout(80);
  await page.mouse.move(s.x, targetY, { steps: 3 });
  await page.waitForTimeout(80);
  // The ungrouped section glows as the active drop target.
  await expect(
    sidebar.locator("[data-sidebar-drop-group=''] [data-drop-active]"),
  ).toHaveCount(1);
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Solo is now ungrouped → the group holds only 1.
  await expect(header.getByText("1")).toBeVisible();
});
