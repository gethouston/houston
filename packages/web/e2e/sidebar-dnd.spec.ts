import type { Locator, Page } from "@playwright/test";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { startNewTeam } from "./support/sidebar-create";

/**
 * Sidebar TEAM drag (@dnd-kit, always-on), against the REAL rail.
 *
 * **A drag reorders an agent inside its OWN team, and that is all it can do.**
 * Dropping an agent into another block is no longer a valid gesture: moving an
 * agent between teams is a named action on the team screen, because it changes
 * what a team HOLDS and a slip of the wrist across a rail full of blocks is not
 * a way to decide that. What is left for a drag to say is position — an agent's
 * inside its team, and a team block's among its siblings — and both must
 * survive a reload, which is the only honest test of "it persists".
 *
 * The team STRUCTURE itself is asserted in `sidebar-teams.spec.ts`.
 */

async function center(loc: Locator) {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no bounding box");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drag `source` onto `target`. The target's position is read ONCE, after the
 *  drag has activated (so any lift-time reflow is in) and never again: the
 *  sortable list live-reorders on every hover, so re-reading the target
 *  mid-drag chases it into its swapped slot and swaps it right back —
 *  dnd-kit then reports the item dropped over ITSELF (flaky order). */
async function dragOnto(page: Page, source: Locator, target: Locator) {
  const s = await center(source);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(s.x, s.y + 10, { steps: 5 }); // cross activation
  const t = await center(target);
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await page.waitForTimeout(120); // let the hover's live-reorder commit
  await page.mouse.up();
  await page.waitForTimeout(300); // drop-animation + overlay unmount
}

async function rowY(sidebar: Locator, name: string) {
  return (await sidebar.getByText(name, { exact: true }).boundingBox())?.y ?? 0;
}

/**
 * The agent rows inside the ONE named team of these specs, and inside the
 * trailing default block. Where an agent SITS is the only membership the user
 * can see: the block header carries its name and nothing else, so "the drop
 * landed" is a question about which container holds the row.
 */
function teamRows(sidebar: Locator): Locator {
  return sidebar.locator(
    '[data-sidebar-drop-section]:not([data-sidebar-drop-section=""])',
  );
}
function defaultRows(sidebar: Locator): Locator {
  return sidebar.locator('[data-sidebar-drop-section=""]');
}

/** A named team holding nobody yet, created through the rail's own flow. */
async function createTeamNamed(page: Page, name: string) {
  await startNewTeam(page);
  const dialog = page.getByRole("dialog", { name: "Create a team" });
  const nameInput = dialog.getByRole("textbox", { name: "Team name" });
  await nameInput.waitFor({ state: "visible" });
  await nameInput.pressSequentially(name);
  await dialog.getByRole("button", { name: "Create team" }).click();
}

test("team create + type name + reorder agents inside the default team", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  await createAgent(page, "Alpha");
  await createAgent(page, "Beta");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  // Create menu → "New team" opens the identity dialog. Type the name
  // char-by-char to exercise the real field before submitting it.
  await createTeamNamed(page, "Work");
  await expect(header).toHaveCount(1);
  await expect(sidebar.getByText("Work")).toBeVisible(); // full name, not "k"

  // Reorder INSIDE the default team, with a named team present: Beta onto
  // Houston so Beta ends up above Houston.
  expect(await rowY(sidebar, "Beta")).toBeGreaterThan(
    await rowY(sidebar, "Houston"),
  );
  // Arm the write listener BEFORE the drop: the reload below must not race
  // the layout PUT, or it re-reads the pre-drag order from the server.
  const layoutWrite = page.waitForResponse(
    (r) =>
      r.url().includes("/sidebar-layout") &&
      r.request().method() === "PUT" &&
      r.ok(),
  );
  await dragOnto(
    page,
    sidebar.getByText("Beta", { exact: true }),
    sidebar.getByText("Houston", { exact: true }),
  );
  // Poll: the committed order re-renders from the layout write-back, a beat
  // after the drop animation ends.
  await expect
    .poll(
      async () =>
        (await rowY(sidebar, "Beta")) < (await rowY(sidebar, "Houston")),
    )
    .toBe(true);
  await layoutWrite;

  // Every gesture above is written back with
  // `PUT /v1/workspaces/:id/sidebar-layout`. A reload throws away all the
  // client state and re-reads that layout, so what survives here is what the
  // server was actually told.
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(header).toHaveCount(1);
  await expect(sidebar.getByText("Work")).toBeVisible();
  // Same poll after reload: the server layout applies a beat after first paint.
  await expect
    .poll(
      async () =>
        (await rowY(sidebar, "Beta")) < (await rowY(sidebar, "Houston")),
    )
    .toBe(true);
});

test("an agent dragged onto ANOTHER team is refused and stays put", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
  await createAgent(page, "Nova");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  await createTeamNamed(page, "Work");
  await expect(header).toHaveCount(1);

  // Both agents start in the DEFAULT block, and the named team is empty.
  await expect(defaultRows(sidebar)).toContainText("Nova");
  await expect(teamRows(sidebar).locator("[data-sidebar-item]")).toHaveCount(0);

  // Drag Nova onto the named team's header — the old way in. Nothing happens:
  // no block highlights while the pointer is over a team that will not take it,
  // and releasing simply drops the row back where it came from.
  await dragOnto(page, sidebar.getByText("Nova", { exact: true }), header);
  await expect(sidebar.locator("[data-drop-active]")).toHaveCount(0);
  await expect(teamRows(sidebar).locator("[data-sidebar-item]")).toHaveCount(0);
  await expect(defaultRows(sidebar)).toContainText("Nova");

  // And nothing was written: a reload comes back to the same rail.
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(teamRows(sidebar).locator("[data-sidebar-item]")).toHaveCount(0);
  await expect(defaultRows(sidebar)).toContainText("Nova");
});

test("a COLLAPSED team is not a way in either", async ({ page }) => {
  await page.goto("/");
  await createAgent(page, "Nova");

  const sidebar = page.locator("[data-tour-target='agents']");
  const header = page.locator("[data-sidebar-group-header]");

  await createTeamNamed(page, "Team");
  await expect(header).toHaveCount(1);

  // Fold the named team. Its header used to resolve to the block as a drop
  // target, which made a folded team the easiest place to lose an agent.
  // Clicking a team the user is not in opens it and folds every other, so two
  // clicks — Team, then the workspace's own block — leave Team folded and the
  // agents on screen to drag.
  await header.getByText("Team").click();
  await page
    .locator("[data-sidebar-default-header]")
    .getByRole("button")
    .click();
  await expect(
    header.getByRole("button", { name: "Team", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");

  await dragOnto(page, sidebar.getByText("Nova", { exact: true }), header);
  await expect(defaultRows(sidebar)).toContainText("Nova");

  // Unfolding says so: the team is still empty. (Clicking a team the user is
  // not in opens it, which unfolds it.)
  await header.getByText("Team").click();
  await expect(teamRows(sidebar).locator("[data-sidebar-item]")).toHaveCount(0);
});
