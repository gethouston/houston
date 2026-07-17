import { expect, test } from "./support/fixtures";

/**
 * The Files tab on the host adapter (HOU-677 follow-through): the default
 * Drive-style card grid with per-folder navigation, the Finder-style list
 * view behind the toggle, uploads through the footer button, context-menu
 * rename + delete, and the browser-mode footer ("Download all" —
 * reveal-in-OS only exists on a co-located desktop). The fake host models
 * the real host's `files*` routes (see `@houston/fake-host` routes-files.ts).
 */

async function openFilesTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  // Seeded workspace: Q3 report.pdf + Docs/sales.csv.
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
}

test("grid is the default: cards, folder navigation, breadcrumbs", async ({
  page,
}) => {
  await openFilesTab(page);

  // Grid mode is on by default (toggle pressed) and shows no column headers.
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Date Modified" })).toHaveCount(
    0,
  );

  // Entering a folder swaps the grid to that level and grows the breadcrumb.
  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);
  const crumbs = page.getByRole("navigation", { name: "Folder path" });
  await expect(crumbs.getByText("Docs", { exact: true })).toBeVisible();

  // The root crumb (the agent's name) walks back up.
  await crumbs.getByRole("button").first().click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
});

test("list view keeps kind, size, and both date columns", async ({ page }) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // Column headers, including the new Date Created.
  for (const col of ["Name", "Date Modified", "Date Created", "Size", "Kind"]) {
    await expect(page.getByRole("button", { name: col })).toBeVisible();
  }
  // The folder row and the file row, with Finder-style kind labels.
  await expect(page.getByText("Docs", { exact: true })).toBeVisible();
  await expect(page.getByText("PDF Document")).toBeVisible();

  // Browser build: no OS file manager — the footer offers Download all +
  // Upload files, never "Open in File Manager".
  await expect(
    page.getByRole("button", { name: "Upload files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeVisible();
  await expect(page.getByText("Open in File Manager")).toHaveCount(0);
});

test("uploads a file through the footer button", async ({ page }) => {
  await openFilesTab(page);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload files" }).click(),
  ]);
  await chooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# uploaded from the files tab"),
  });

  // The upload lands in the fake host's workspace and the grid refreshes.
  await expect(page.getByText("notes.md")).toBeVisible();
  // The list view knows its Finder-style kind label.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText("Markdown", { exact: true })).toBeVisible();
});

test("renames and deletes a file from the context menu", async ({ page }) => {
  await openFilesTab(page);

  const row = page.getByText("Q3 report.pdf");
  await row.click({ button: "right" });
  // Browser mode: Preview + Download (no reveal). Rename swaps in an inline input.
  await expect(page.getByRole("menu").getByText("Download")).toBeVisible();
  await expect(
    page.getByRole("menu").getByText("Show in File Manager"),
  ).toHaveCount(0);
  await page.getByRole("menu").getByText("Rename").click();
  // The inline rename field is the only textbox on the Files tab (the sidebar
  // search is a searchbox). A controlled input's value is a DOM property, so
  // an attribute selector would never match it.
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("Q3 report.pdf");
  await input.fill("Q3 final.pdf");
  await input.press("Enter");
  await expect(page.getByText("Q3 final.pdf")).toBeVisible();

  await page.getByText("Q3 final.pdf").click({ button: "right" });
  await page.getByRole("menu").getByText("Move to Trash").click();
  await expect(page.getByText("Q3 final.pdf")).toHaveCount(0);
});

test("renames and deletes a folder from its context menu (grid)", async ({
  page,
}) => {
  await openFilesTab(page);

  await page.getByText("Docs", { exact: true }).click({ button: "right" });
  await page.getByRole("menu").getByText("Rename").click();
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("Docs");
  await input.fill("Reports");
  await input.press("Enter");
  await expect(page.getByText("Reports", { exact: true })).toBeVisible();

  // Its contents moved with it.
  await page.getByText("Reports", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Folder path" })
    .getByRole("button")
    .first()
    .click();

  // Deleting the folder removes the whole subtree.
  await page.getByText("Reports", { exact: true }).click({ button: "right" });
  await page.getByRole("menu").getByText("Move to Trash").click();
  await expect(page.getByText("Reports", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
});

test("the toolbar's new-folder button creates a folder in the open folder", async ({
  page,
}) => {
  await openFilesTab(page);

  await page.getByRole("button", { name: "New folder" }).click();
  const input = page.getByPlaceholder("untitled folder");
  await input.fill("Drafts");
  await input.press("Enter");
  await expect(page.getByText("Drafts", { exact: true })).toBeVisible();
});

test("a folder downloads as its own zip from the context menu", async ({
  page,
  browserName,
}) => {
  // Playwright WebKit never emits `download` for blob-anchor saves; the real
  // desktop WKWebView doesn't use this path at all (native save_download IPC).
  test.skip(
    browserName === "webkit",
    "no download events on Playwright WebKit",
  );
  await openFilesTab(page);

  await page.getByText("Docs", { exact: true }).click({ button: "right" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menu").getByText("Download").click(),
  ]);
  const file = await download.path();
  const { readFileSync } = await import("node:fs");
  const zip = readFileSync(file);
  expect(zip.subarray(0, 2).toString("latin1")).toBe("PK");
  // Zip entry names are stored verbatim; the folder is the archive's root.
  expect(zip.toString("latin1")).toContain("Docs/sales.csv");
});

test("Download all saves the whole workspace as one zip", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "no download events on Playwright WebKit",
  );
  await openFilesTab(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download all" }).click(),
  ]);
  // Headless Chromium names blob downloads with a GUID, so assert the content
  // (a real zip with bytes in it), not the browser-computed filename.
  const file = await download.path();
  const { readFileSync } = await import("node:fs");
  const zip = readFileSync(file);
  expect(zip.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(zip.length).toBeGreaterThan(50);
});
