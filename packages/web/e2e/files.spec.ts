import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";
import { openTeamSection } from "./support/team-nav";

async function openFiles(page: import("@playwright/test").Page) {
  const agents = (await (
    await page.request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as { id: string }[];
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "files-team",
        name: "Files",
        collapsed: false,
        agentIds: agents.map((agent) => agent.id),
      },
    ],
    order: [],
  });
  await page.goto("/");
  await openTeamSection(page, "Files");
}

function row(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

test("an employee's Files is its own tree under one column band", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents`, { data: { name: "Kai" } });
  await openFiles(page);

  await expect(page.getByRole("button", { name: "Name" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Modified" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Size" })).toHaveCount(1);
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(
    page.getByRole("row", { name: `${SEED_AGENT_NAME} files` }),
  ).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Kai files/ })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
});

test("folders fold in place", async ({ page }) => {
  await openFiles(page);

  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(row(page, "sales.csv")).toBeVisible();
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

  const rootCheckbox = row(page, "Q3 report.pdf").getByRole("checkbox");
  const childCheckbox = row(page, "sales.csv").getByRole("checkbox");
  await expect(rootCheckbox).toBeVisible();
  await expect(childCheckbox).toBeVisible();

  const rootBox = await rootCheckbox.boundingBox();
  const childBox = await childCheckbox.boundingBox();
  expect(rootBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox?.x).toBeGreaterThan(rootBox?.x ?? 0);

  await rootCheckbox.check();
  const selectAll = page.getByRole("checkbox", { name: "Select all" });
  await expect(selectAll).toBeVisible();
  const selectAllBox = await selectAll.boundingBox();
  expect(selectAllBox).not.toBeNull();
  expect(selectAllBox?.x).toBeLessThanOrEqual(
    rootBox?.x ?? Number.POSITIVE_INFINITY,
  );

  await selectAll.check();
  await expect(rootCheckbox).toBeChecked();
  await expect(childCheckbox).toBeChecked();
  await selectAll.click();
  await expect(rootCheckbox).not.toBeChecked();
  await expect(childCheckbox).not.toBeChecked();
  await expect(selectAll).toHaveCount(0);
});

test("search filters the employee's tree and clearing restores it", async ({
  page,
}) => {
  await openFiles(page);

  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search files" }).fill("Q3");
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(row(page, "sales.csv")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(row(page, "sales.csv")).toBeVisible();
});

test("New offers the employee's own actions, never an agent choice", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents`, { data: { name: "Kai" } });
  await openFiles(page);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Kai" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "New folder" }).press("Enter");
  await expect(page.getByPlaceholder("untitled folder")).toBeVisible();
});

test("the toolbar carries Download all in browser builds", async ({ page }) => {
  await openFiles(page);

  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeVisible();
});

test("Download in the file preview saves the bytes and never opens a tab", async ({
  page,
  context,
}) => {
  await openFiles(page);

  const extraPages: unknown[] = [];
  context.on("page", (p) => extraPages.push(p));

  await row(page, "sales.csv").getByText("sales.csv").click();
  const panel = page.getByRole("region", { name: "Preview of sales.csv" });
  await expect(panel.getByText("a,b")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download .csv" }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toBe("a,b\n1,2\n");
  expect(extraPages).toHaveLength(0);
});

test("renaming a file onto a name already in use says so and keeps both files", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/files/import`, {
    data: {
      files: [
        {
          name: "notes.txt",
          contentBase64: Buffer.from("x").toString("base64"),
        },
      ],
    },
  });
  await openFiles(page);
  await expect(row(page, "notes.txt")).toBeVisible();

  await row(page, "notes.txt")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menu").getByRole("button", { name: "Rename" }).click();
  const input = page.getByRole("row").getByRole("textbox");
  await input.fill("Q3 report.pdf");
  await input.press("Enter");

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "already exists here" })
      .filter({ hasText: "Q3 report.pdf" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("toast-container").getByRole("alert"),
  ).toHaveCount(0);

  await expect(row(page, "notes.txt")).toHaveCount(1);
  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  const listed = (await (
    await request.get(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/files`)
  ).json()) as Array<{ path: string }>;
  expect(listed.map((f) => f.path)).toEqual(
    expect.arrayContaining(["notes.txt", "Q3 report.pdf"]),
  );
});

test("a new folder named after an existing file says the name is taken", async ({
  page,
}) => {
  await openFiles(page);
  await expect(row(page, "Q3 report.pdf")).toBeVisible();

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  const input = page.getByPlaceholder("untitled folder");
  await input.fill("Q3 report.pdf");
  await input.press("Enter");

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "already exists here" })
      .filter({ hasText: "Q3 report.pdf" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("toast-container").getByRole("alert"),
  ).toHaveCount(0);

  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  await expect(row(page, "Q3 report.pdf")).toContainText("9 bytes");
});

test("a read-only workspace says so instead of failing in silence", async ({
  page,
  request,
}) => {
  await openFiles(page);
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await request.post(`${FAKE_HOST_URL}/__test__/workspace-read-only`, {
    data: { agentIds: [SEED_AGENT_ID] },
  });

  await row(page, "Q3 report.pdf")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menu").getByRole("button", { name: "Rename" }).click();
  const input = page.getByRole("row").getByRole("textbox");
  await input.fill("Q4 report.pdf");
  await input.press("Enter");

  const toasts = page.getByTestId("toast-container");
  const refusal = toasts
    .getByRole("status")
    .filter({ hasText: "can’t be changed right now" })
    .filter({ hasText: "Check the folder’s permissions" });
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveCount(1);
  await expect(toasts.getByRole("alert")).toHaveCount(0);

  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  await expect(row(page, "Q4 report.pdf")).toHaveCount(0);
});
