import type { Locator, Page } from "@playwright/test";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

/**
 * Sidebar TEAM drag (Notion/Mercury-style @dnd-kit, always-on). Drives the REAL
 * sidebar and covers the regressions: multi-character team names, dragging an
 * agent INTO and back OUT of a team, and reordering the default team's agents
 * WITH a named team present. Everything must persist across a reload.
 *
 * Every block now carries destination rows (Mission Control, Team Settings)
 * above its agents, so the drags here also guard that those rows never become
 * drop targets and never shift the coordinates the drops rely on. The team
 * STRUCTURE itself is asserted in `sidebar-teams.spec.ts`.
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

test("team create + type name + drag in/out + default-team reorder", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  await createAgent(page, "Alpha");
  await createAgent(page, "Beta");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  // Folder button → team opens in rename. TYPE the name char-by-char: a
  // re-focus-and-select on every render used to eat all but the last keystroke.
  await page.getByRole("button", { name: "New team" }).click();
  const nameInput = page.getByPlaceholder("Team name");
  await nameInput.waitFor({ state: "visible" });
  await nameInput.pressSequentially("Work");
  await nameInput.press("Enter");
  await expect(header).toHaveCount(1);
  await expect(sidebar.getByText("Work")).toBeVisible(); // full name, not "k"

  // Drag "Alpha" INTO the team — a one-shot pulse confirms the drop.
  await dragOnto(page, sidebar.getByText("Alpha", { exact: true }), header);
  await expect(page.locator(".sidebar-group-dropped")).toHaveCount(1);
  await expect(header.getByText("1")).toBeVisible();

  // Drag "Alpha" back OUT of the team, onto a default-team agent.
  await dragOnto(
    page,
    sidebar.getByText("Alpha", { exact: true }),
    sidebar.getByText("Houston", { exact: true }),
  );
  await expect(header.getByText("0")).toBeVisible();

  // Reorder a DEFAULT-TEAM agent while a named team exists: Beta onto
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

  // Every gesture above (create, drag in, drag out, reorder) is written back
  // with `PUT /v1/workspaces/:id/sidebar-layout`. A reload throws away all the
  // client state and re-reads that layout, so what survives here is what the
  // server was actually told — the only honest test of "it persists".
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(header).toHaveCount(1);
  await expect(sidebar.getByText("Work")).toBeVisible();
  // Emptied by the drag OUT, not merely re-rendered as empty.
  await expect(header.getByText("0")).toBeVisible();
  // And the reorder held: Beta is still above Houston.
  expect(await rowY(sidebar, "Beta")).toBeLessThan(
    await rowY(sidebar, "Houston"),
  );
});

test("dropping onto a COLLAPSED team confirms with a pulse", async ({
  page,
}) => {
  await page.goto("/");
  await createAgent(page, "Nova");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  await page.getByRole("button", { name: "New team" }).click();
  const ni = page.getByPlaceholder("Team name");
  await ni.waitFor({ state: "visible" });
  await ni.fill("Team");
  await ni.press("Enter");
  await expect(header).toHaveCount(1);

  // Seed the team with Nova, then collapse it.
  await dragOnto(page, sidebar.getByText("Nova", { exact: true }), header);
  await expect(header.getByText("1")).toBeVisible();
  await header.getByText("Team").click();
  await expect(sidebar.getByText("Nova", { exact: true })).toHaveCount(0);

  // Drop another agent onto the COLLAPSED team: nothing else moves visibly,
  // so the pulse is the only confirmation. Count ticks to 2.
  await dragOnto(page, sidebar.getByText("Houston", { exact: true }), header);
  await expect(page.locator(".sidebar-group-dropped")).toHaveCount(1);
  await expect(header.getByText("2")).toBeVisible();
});

test("drag an agent OUT into an empty DEFAULT TEAM (reserved slot)", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  // Put the only two agents (Houston seed + Solo) both into one named team so
  // the DEFAULT team holds nobody — dragging out must use its reserved slot,
  // which now sits below that team's own destination rows.
  await createAgent(page, "Solo");
  await page.getByRole("button", { name: "New team" }).click();
  const ni = page.getByPlaceholder("Team name");
  await ni.waitFor({ state: "visible" });
  await ni.fill("All");
  await ni.press("Enter");
  await dragOnto(page, sidebar.getByText("Solo", { exact: true }), header);
  await dragOnto(page, sidebar.getByText("Houston", { exact: true }), header);
  await expect(header.getByText("2")).toBeVisible();

  // Drag Solo down into the empty default team. Aim at its droppable itself
  // (measured DURING the drag, once the reserved slot has opened) rather than
  // at an offset below the named team: the default team now has a header and
  // destination rows above that slot, and a fixed offset would land on them.
  const solo = sidebar.getByText("Solo", { exact: true });
  const s = await center(solo);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(s.x, s.y + 10, { steps: 5 });
  const dropZone = sidebar.locator("[data-sidebar-drop-section='']");
  const zone = await dropZone.boundingBox();
  if (!zone) throw new Error("no default drop zone");
  const targetY = zone.y + zone.height - 8;
  await page.mouse.move(s.x, targetY, { steps: 15 });
  await page.waitForTimeout(80);
  await page.mouse.move(s.x, targetY, { steps: 3 });
  await page.waitForTimeout(80);
  // The default team glows as the active drop target.
  await expect(
    sidebar.locator("[data-sidebar-drop-group=''] [data-drop-active]"),
  ).toHaveCount(1);
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Solo is back in the default team → the named team holds only 1.
  await expect(header.getByText("1")).toBeVisible();
});
