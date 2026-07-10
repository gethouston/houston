import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The routine row's three-dot menu ("More actions", always visible, never
 * hover-gated). Rows aren't clickable — the menu is the only way in: Edit
 * manually expands the inline name/schedule/instruction panel right in the
 * list (renaming happens there), and Delete is confirmed in a dialog before
 * anything is removed.
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

test("renaming happens in the inline Edit manually panel and persists", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  // The three-dot trigger is visible without hovering the row.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();

  // The inline panel opens pre-filled; a new name saves through it.
  const nameField = page.getByPlaceholder("e.g. Morning standup");
  await expect(nameField).toHaveValue("Morning digest");
  await nameField.fill("Evening digest");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Evening digest")).toBeVisible();
  await expect.poll(() => routineNames(agentId)).toEqual(["Evening digest"]);
  // The panel closed on save.
  await expect(nameField).toHaveCount(0);

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

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Nothing is deleted before the dialog confirms.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Delete Doomed digest?")).toBeVisible();
  expect(await routineNames(agentId)).toEqual(["Doomed digest"]);

  // Cancel keeps it…
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Doomed digest")).toBeVisible();

  // …confirm removes it.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Doomed digest")).toHaveCount(0);
  await expect.poll(() => routineNames(agentId)).toEqual([]);
});
