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
    page.getByRole("button", { name: "Expand Houston files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand Kai files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
});

test("one agent auto-expands and folders expand in place", async ({ page }) => {
  await openFiles(page);

  await expect(
    page.getByRole("button", { name: "Collapse Houston files" }),
  ).toBeVisible();
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await row(page, "Docs").click();
  await expect(row(page, "sales.csv")).toBeVisible();
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
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

  await page.getByRole("button", { name: "Expand Houston files" }).click();
  await page.getByRole("button", { name: "Expand Research Bot files" }).click();
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(row(page, "research.md")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search files" }).fill("research");
  await expect(row(page, "research.md")).toBeVisible();
  await expect(row(page, "Q3 report.pdf")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
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
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await expect(
    page.getByRole("button", { name: "Collapse Kai files" }),
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
