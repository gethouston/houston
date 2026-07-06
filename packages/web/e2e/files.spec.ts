import { expect, test } from "./support/fixtures";

/**
 * The Files tab on the host adapter (HOU-677 follow-through): listing with
 * full metadata, uploads through the footer button, context-menu rename +
 * delete, and the browser-mode footer ("Download all" — reveal-in-OS only
 * exists on a co-located desktop). The fake host models the real host's
 * `files*` routes (see `@houston/fake-host` routes-files.ts).
 */

async function openFilesTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  // Seeded workspace: Q3 report.pdf + Docs/sales.csv.
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
}

test("lists files with kind, size, and both date columns", async ({ page }) => {
  await openFilesTab(page);

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

  // The upload lands in the fake host's workspace and the listing refreshes.
  await expect(page.getByText("notes.md")).toBeVisible();
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

test("a folder downloads as its own zip from the context menu", async ({
  page,
}) => {
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

test("Download all saves the whole workspace as one zip", async ({ page }) => {
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
