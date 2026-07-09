import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The routine row's quick actions: a three-dot menu (always visible, never
 * hover-gated) offering Rename — an inline title edit, committed on Enter —
 * and Delete, confirmed in a dialog before anything is removed. The old
 * status dot is now a state icon, so the row still renders its schedule and
 * next-run meta unchanged around it.
 */

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

async function seedRoutine(agentId: string, name: string): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, prompt: "p", schedule: "0 9 * * *" }),
  });
}

async function routineNames(agentId: string): Promise<string[]> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { name: string }[] };
  return items.map((r) => r.name);
}

async function openRoutinesTab(page: import("@playwright/test").Page) {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

test("rename from the row menu edits the title inline and persists", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  // The three-dot trigger is visible without hovering the row.
  await page
    .getByRole("button", { name: "Routine options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // Inline edit: the title becomes an input; Enter commits.
  const input = page.getByRole("textbox", { name: "Rename" });
  await expect(input).toBeVisible();
  await input.fill("Evening digest");
  await input.press("Enter");

  await expect(page.getByText("Evening digest")).toBeVisible();
  await expect.poll(() => routineNames(agentId)).toEqual(["Evening digest"]);

  // Renaming from the row never opened the editor.
  await expect(page.getByRole("button", { name: "Run now" })).toHaveCount(0);

  await page.screenshot({
    path: test.info().outputPath("routine-row-quick-actions.png"),
  });
});

test("delete from the row menu confirms first, then removes the routine", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Doomed digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Doomed digest")).toBeVisible();

  await page
    .getByRole("button", { name: "Routine options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Nothing is deleted before the dialog confirms.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Delete "Doomed digest"?')).toBeVisible();
  expect(await routineNames(agentId)).toEqual(["Doomed digest"]);

  // Cancel keeps it…
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Doomed digest")).toBeVisible();

  // …confirm removes it.
  await page
    .getByRole("button", { name: "Routine options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Doomed digest")).toHaveCount(0);
  await expect.poll(() => routineNames(agentId)).toEqual([]);
});
