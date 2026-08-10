import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";

async function openFiles(page: import("@playwright/test").Page) {
  await page.goto("/");
  await openTeamSection(page, "Files");
}

function row(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

test("Files is one list with agent accordions and one shared column band", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents`, { data: { name: "Kai" } });
  await openFiles(page);

  await expect(page.getByRole("button", { name: "Name" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Modified" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Size" })).toHaveCount(1);
  await expect(
    page.getByRole("row", { name: "Expand Houston files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Expand Kai files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
});

test("one agent auto-expands and folders fold in place", async ({ page }) => {
  await openFiles(page);

  await expect(
    page.getByRole("row", { name: "Collapse Houston files" }),
  ).toBeVisible();
  // The list is the whole workspace: folders start OPEN (Library-list
  // grammar), so the folder's contents are on screen from the first paint…
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(row(page, "sales.csv")).toBeVisible();
  // …and Enter on the folder row folds it in place, without navigating.
  await row(page, "Docs").press("Enter");
  await expect(row(page, "sales.csv")).toHaveCount(0);
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await row(page, "Docs").press("Enter");
  await expect(row(page, "sales.csv")).toBeVisible();
});

test("file checkboxes live in the tree and select-all swaps into its header slot", async ({
  page,
}) => {
  await openFiles(page);

  const agentRow = page.getByRole("row", { name: "Collapse Houston files" });
  const rootCheckbox = row(page, "Q3 report.pdf").getByRole("checkbox");
  const childCheckbox = row(page, "sales.csv").getByRole("checkbox");
  await expect(agentRow.getByRole("checkbox")).toHaveCount(0);
  await expect(rootCheckbox).toBeVisible();
  await expect(childCheckbox).toBeVisible();

  const agentBox = await agentRow.boundingBox();
  const rootBox = await rootCheckbox.boundingBox();
  const childBox = await childCheckbox.boundingBox();
  expect(agentBox).not.toBeNull();
  expect(rootBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(rootBox?.x).toBeGreaterThan(agentBox?.x ?? 0);
  expect(childBox?.x).toBeGreaterThan(rootBox?.x ?? 0);

  await rootCheckbox.check();
  const selectAll = page.getByRole("checkbox", { name: "Select all" });
  await expect(selectAll).toBeVisible();
  const selectAllBox = await selectAll.boundingBox();
  expect(selectAllBox).not.toBeNull();
  expect(selectAllBox?.x).toBeGreaterThan(agentBox?.x ?? 0);
  expect(selectAllBox?.x).toBeLessThan(rootBox?.x ?? Number.POSITIVE_INFINITY);

  await selectAll.check();
  await expect(rootCheckbox).toBeChecked();
  await expect(childCheckbox).toBeChecked();
  // Not uncheck(): clearing the selection UNMOUNTS the selection bar, and
  // uncheck's post-click verification races that unmount. Click, then assert
  // the outcome — rows cleared, the bar (and its select-all) gone.
  await selectAll.click();
  await expect(rootCheckbox).not.toBeChecked();
  await expect(childCheckbox).not.toBeChecked();
  await expect(selectAll).toHaveCount(0);
});

test("multiple agents stay open and search filters only expanded sections", async ({
  page,
  request,
}) => {
  const created = await request.post(`${FAKE_HOST_URL}/agents`, {
    data: { name: "Research Bot" },
  });
  const agent = (await created.json()) as { id: string };
  await request.post(`${FAKE_HOST_URL}/agents/${agent.id}/files/import`, {
    data: {
      files: [
        {
          name: "research.md",
          contentBase64: Buffer.from("notes").toString("base64"),
        },
      ],
    },
  });
  await openFiles(page);

  await page.getByRole("row", { name: "Expand Houston files" }).click();
  await page.getByRole("row", { name: "Expand Research Bot files" }).click();
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(row(page, "research.md")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search files" }).fill("research");
  await expect(row(page, "research.md")).toBeVisible();
  await expect(row(page, "Q3 report.pdf")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
});

test("New asks for an agent when the team has multiple agents", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents`, { data: { name: "Kai" } });
  await openFiles(page);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Houston" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Kai" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Kai" }).hover();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitem", { name: "New folder" }).press("Enter");
  await expect(
    page.getByRole("row", { name: "Collapse Kai files" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("untitled folder")).toBeVisible();
});

test("the agent row owns Download all in browser builds", async ({ page }) => {
  await openFiles(page);

  const houston = row(page, "Houston");
  await houston.getByRole("button", { name: "More actions" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Download all" }),
  ).toBeVisible();
});
