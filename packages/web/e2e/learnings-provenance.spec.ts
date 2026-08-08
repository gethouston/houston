import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAgentSettings } from "./support/team-nav";

/**
 * Memory (learnings) provenance — HOU-946.
 *
 * Every learning links back to the person who taught it and the mission it came
 * from, and that link has to be VISIBLE wherever learnings are shown. The fake
 * host seeds two: one stamped with both halves, one with neither.
 *
 * The default e2e project is single-player with identity off, so no roster
 * resolves — which is exactly the desktop case. The line must still read, from
 * the name stored on the learning itself. And the learning WITHOUT provenance
 * must render no line at all rather than a hollow "From unknown".
 */

/** The agent settings page → its Memory section. */
async function openMemory(page: Page) {
  await page.goto("/");
  await openAgentSettings(page, "Houston", "Memory");
}

// NOTE: no test title here may END in the word "from" — `check:boundaries`
// extracts imports with a regex that reads `from"` as a specifier and reports
// the rest of the file as an undeclared dependency.
test("a learning shows the person who taught it and its mission", async ({
  page,
}) => {
  await openMemory(page);

  const stamped = page
    .locator("article")
    .filter({ hasText: "Exclude churned accounts from pipeline math." });
  await expect(stamped).toBeVisible();
  // Person AND mission, in one muted line. The mission title is the LIVE one
  // (looked up by mission_id against the seeded board), not a stale copy.
  await expect(
    stamped.getByText("From Ada Lovelace · Plan a trip to Tokyo"),
  ).toBeVisible();
  // The face renders from initials when no roster photo is available.
  await expect(stamped.getByText("AL", { exact: true })).toBeVisible();
});

test("a learning with no provenance renders no provenance line", async ({
  page,
}) => {
  await openMemory(page);

  const plain = page
    .locator("article")
    .filter({ hasText: "Prefers metric units in every report." });
  await expect(plain).toBeVisible();
  await expect(plain.getByText(/^From /)).toHaveCount(0);
});

test("the provenance line survives an edit and stays out of the editor", async ({
  page,
}) => {
  await openMemory(page);

  // Pinned by position, not by text: the editor replaces the row's rendered
  // text, so a text filter would stop matching the moment we type.
  const stamped = page.locator("article").first();
  await expect(stamped).toContainText(
    "Exclude churned accounts from pipeline math.",
  );
  await stamped.getByRole("button", { name: "Edit learning" }).click();

  // Editing is about the text; provenance is not the editor's to change.
  const editor = stamped.getByRole("textbox");
  await expect(editor).toBeVisible();
  await expect(stamped.getByText(/^From /)).toHaveCount(0);

  await editor.fill("Exclude churned accounts, and dormant ones too.");
  await stamped.getByRole("button", { name: "Save" }).click();

  // The rewritten learning keeps the provenance the update path preserved.
  await expect(stamped).toContainText(
    "Exclude churned accounts, and dormant ones too.",
  );
  await expect(
    stamped.getByText("From Ada Lovelace · Plan a trip to Tokyo"),
  ).toBeVisible();
});
