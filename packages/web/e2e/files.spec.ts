import { expect, test } from "./support/fixtures";

/**
 * The Files tab on the host adapter (HOU-677 follow-through): the default
 * Drive-style card grid with per-folder navigation, the Finder-style list
 * view behind the toggle (also scoped to the open folder, so the breadcrumb
 * is truthful in either), uploads through the header's Upload menu (files or
 * a whole folder, HOU-889) and the empty-folder CTA, both landing in the open
 * folder like a drop does, header search, per-row kebab menus, the delete
 * confirmation and the client-side upload size cap (HOU-970), and the
 * browser-mode header action ("Download all" — reveal-in-OS only exists on a
 * co-located desktop). The fake host models the real host's `files*` routes
 * (see `@houston/fake-host` routes-files.ts).
 */

async function openFilesTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  // Seeded workspace: Q3 report.pdf + Docs/sales.csv.
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
}

/** Open the header's Upload menu and pick an item, resolving its filechooser. */
async function openUploadChooser(
  page: import("@playwright/test").Page,
  item: "Upload files" | "Upload folder",
) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    (async () => {
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await page.getByRole("menuitem", { name: item }).click();
    })(),
  ]);
  return chooser;
}

/**
 * "Move to Trash" now asks first (HOU-970): the context menu opens a confirm
 * dialog naming the target, and only its button actually deletes.
 */
async function deleteViaContextMenu(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
  name: string,
) {
  await target.click({ button: "right" });
  await page.getByRole("menu").getByText("Move to Trash").click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(name);
  await confirm.getByRole("button", { name: "Move to Trash" }).click();
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

  // Browser build: no OS file manager — the header offers Download all +
  // the Upload menu, never "Open in File Manager".
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeVisible();
  await expect(page.getByText("Open in File Manager")).toHaveCount(0);
});

test("list view is scoped to the open folder, breadcrumb and all", async ({
  page,
}) => {
  await openFilesTab(page);

  // Enter a folder in the grid, then switch: the list follows you in instead
  // of falling back to the whole workspace, so the trail stays truthful.
  await page.getByText("Docs", { exact: true }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);
  const crumbs = page.getByRole("navigation", { name: "Folder path" });
  await expect(crumbs.getByText("Docs", { exact: true })).toBeVisible();

  // The root crumb walks back up without leaving the list.
  await crumbs.getByRole("button").first().click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("per-row kebabs reach rename and delete without a right-click", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // A folder row is a row, not a button: role="button" prunes its children,
  // which would hide the row's own kebab from assistive tech entirely.
  const folderKebab = page
    .getByRole("row")
    .filter({ hasText: "Docs" })
    .getByRole("button", { name: "More actions" });
  await folderKebab.click();
  await expect(page.getByRole("menu").getByText("Rename")).toBeVisible();
  await expect(page.getByRole("menu").getByText("Move to Trash")).toBeVisible();
  await page.keyboard.press("Escape");

  // A file row's kebab does the same, and rename works straight from it.
  const fileKebab = page
    .getByRole("row")
    .filter({ hasText: "Q3 report.pdf" })
    .getByRole("button", { name: "More actions" });

  // Both sit in the row's trailing actions column, aligned with each other,
  // instead of floating mid-row beside the Name header's sort caret.
  const folderBox = await folderKebab.boundingBox();
  const fileBox = await fileKebab.boundingBox();
  expect(folderBox?.x).toBeCloseTo(fileBox?.x ?? 0, 0);

  await fileKebab.click();
  await page.getByRole("menu").getByText("Rename").click();
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("Q3 report.pdf");
  await input.fill("Q3 summary.pdf");
  await input.press("Enter");
  await expect(page.getByText("Q3 summary.pdf")).toBeVisible();
});

test("search filters the listing and clears back to everything", async ({
  page,
}) => {
  await openFilesTab(page);
  const search = page.getByRole("searchbox", { name: "Search files" });

  // A file match keeps the file and drops the folder that has nothing to show.
  await search.fill("q3");
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("Docs", { exact: true })).toHaveCount(0);

  // A descendant match keeps its folder, so what you found stays reachable.
  await search.fill("sales");
  await expect(page.getByText("Docs", { exact: true })).toBeVisible();
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);

  // Nothing matches: a notice naming the query back, never a blank canvas,
  // and never a dead end — the state carries its own way out.
  await search.fill("zzz");
  const searchEmpty = page
    .locator('[data-slot="empty"]')
    .filter({ hasText: "No files match your search" });
  await expect(searchEmpty).toBeVisible();
  await expect(searchEmpty).toContainText("zzz");
  await searchEmpty.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("Docs", { exact: true })).toBeVisible();

  // The field's own clear button restores the listing just the same.
  await search.fill("q3");
  await expect(page.getByText("Docs", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Docs", { exact: true })).toBeVisible();
});

test("a search follows you into the folder it found", async ({ page }) => {
  await openFilesTab(page);
  const search = page.getByRole("searchbox", { name: "Search files" });

  // Docs survives only because sales.csv is inside it, so its card must still
  // state the folder's real size instead of the pruned one.
  await search.fill("sales");
  const docs = page.getByText("Docs", { exact: true });
  await expect(docs).toBeVisible();

  // Opening it keeps the search: what you found stays on screen, and the
  // field keeps the text so one click still gets you back to everything.
  await docs.click();
  await expect(search).toHaveValue("sales");
  await expect(page.getByText("sales.csv")).toBeVisible();
});

test("New folder is never a dead click behind an empty search", async ({
  page,
}) => {
  await openFilesTab(page);
  const search = page.getByRole("searchbox", { name: "Search files" });

  // A search matching nothing used to swallow the create-folder card whole:
  // the toolbar button stayed live and did visibly nothing.
  await search.fill("zzz");
  await expect(page.getByText("No files match your search")).toBeVisible();
  await page.getByRole("button", { name: "New folder" }).click();

  // The query steps aside and the inline card is actually there to type in.
  await expect(search).toHaveValue("");
  const name = page.getByPlaceholder("untitled folder");
  await expect(name).toBeVisible();
  await name.fill("Drafts");
  await name.press("Enter");
  await expect(page.getByText("Drafts", { exact: true })).toBeVisible();
});

test("an empty folder states itself in the list view too", async ({ page }) => {
  await openFilesTab(page);

  await page.getByRole("button", { name: "New folder" }).click();
  const name = page.getByPlaceholder("untitled folder");
  await name.fill("Drafts");
  await name.press("Enter");
  await page.getByText("Drafts", { exact: true }).click();
  await expect(page.getByText("This folder is empty")).toBeVisible();

  // The list used to render bare column headers over nothing at all.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText("This folder is empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Date Modified" })).toHaveCount(
    0,
  );
});

test("uploads a file through the header's Upload menu", async ({ page }) => {
  await openFilesTab(page);

  const chooser = await openUploadChooser(page, "Upload files");
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

test("the header's Upload lands the file in the open folder, not the root", async ({
  page,
}) => {
  await openFilesTab(page);

  // Walk into a folder first: the pill has to follow you in, the way a drop
  // already does, or the file silently reappears at the workspace root.
  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();

  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "meeting notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# inside Docs"),
  });
  await expect(page.getByText("meeting notes.md")).toBeVisible();

  // Back at the root it is nowhere to be seen: it really lives inside Docs.
  await page
    .getByRole("navigation", { name: "Folder path" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("meeting notes.md")).toHaveCount(0);
});

test("an empty folder's own Upload CTA targets that folder", async ({
  page,
}) => {
  await openFilesTab(page);

  // A folder created and entered on the spot: its only upload affordance is
  // the empty-state CTA, which must target it and not the root.
  await page.getByRole("button", { name: "New folder" }).click();
  const name = page.getByPlaceholder("untitled folder");
  await name.fill("Drafts");
  await name.press("Enter");
  await page.getByText("Drafts", { exact: true }).click();
  await expect(page.getByText("This folder is empty")).toBeVisible();

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload files" }).click(),
  ]);
  await chooser.setFiles({
    name: "draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# a draft"),
  });
  await expect(page.getByText("draft.md")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Folder path" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByText("draft.md")).toHaveCount(0);
  await expect(page.getByText("Drafts", { exact: true })).toBeVisible();
});

test("a file over the size limit never reaches the host", async ({
  page,
}, testInfo) => {
  const { closeSync, ftruncateSync, openSync } = await import("node:fs");
  const { join } = await import("node:path");
  // 101 MiB, sparse: the cap is checked against the file's reported size
  // before anything is read, so the bytes never have to exist on disk.
  const huge = join(testInfo.outputPath(), "raw-footage.mov");
  const fd = openSync(huge, "w");
  ftruncateSync(fd, 101 * 1024 * 1024);
  closeSync(fd);

  await openFilesTab(page);
  const importCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/files/import"))
      importCalls.push(request.url());
  });

  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles(huge);

  // A calm toast naming the offender, and nothing on the wire.
  await expect(
    page.getByText(/100 MB per file, so raw-footage\.mov was not uploaded/),
  ).toBeVisible();
  expect(importCalls).toEqual([]);
  await expect(page.getByText("raw-footage.mov", { exact: true })).toHaveCount(
    0,
  );
});

test("uploads a whole folder with its structure intact, hidden files skipped", async ({
  page,
}, testInfo) => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  // A real on-disk folder: nested subfolder + a hidden file the intake drops.
  const folder = join(testInfo.outputPath(), "Brand assets");
  mkdirSync(join(folder, "docs"), { recursive: true });
  writeFileSync(join(folder, "logo.svg"), "<svg/>");
  writeFileSync(join(folder, "docs", "intro.md"), "# intro");
  writeFileSync(join(folder, ".DS_Store"), "junk");

  await openFilesTab(page);
  const chooser = await openUploadChooser(page, "Upload folder");
  await chooser.setFiles(folder);

  // The folder lands as a navigable tree, structure preserved.
  await page.getByText("Brand assets", { exact: true }).click();
  await expect(page.getByText("logo.svg")).toBeVisible();
  await expect(page.getByText(".DS_Store")).toHaveCount(0);
  await page.getByText("docs", { exact: true }).click();
  await expect(page.getByText("intro.md")).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Folder path" });
  await expect(crumbs.getByText("Brand assets", { exact: true })).toBeVisible();
  await expect(crumbs.getByText("docs", { exact: true })).toBeVisible();
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

  // Deleting is confirmed first, and cancelling leaves the file alone.
  await page.getByText("Q3 final.pdf").click({ button: "right" });
  await page.getByRole("menu").getByText("Move to Trash").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByText("Q3 final.pdf")).toBeVisible();

  await deleteViaContextMenu(
    page,
    page.getByText("Q3 final.pdf"),
    "Q3 final.pdf",
  );
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

  // Deleting the folder removes the whole subtree (after confirming).
  await deleteViaContextMenu(
    page,
    page.getByText("Reports", { exact: true }),
    "Reports",
  );
  await expect(page.getByText("Reports", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
});

test("an emptied workspace falls back to the drop-ready empty state", async ({
  page,
}) => {
  await openFilesTab(page);

  await deleteViaContextMenu(
    page,
    page.getByText("Q3 report.pdf"),
    "Q3 report.pdf",
  );
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);
  await deleteViaContextMenu(
    page,
    page.getByText("Docs", { exact: true }),
    "Docs",
  );

  // Zero files: the headline, both CTAs, and the visible drop affordance.
  await expect(page.getByText("No files yet")).toBeVisible();
  await expect(page.getByText("or drag and drop files here")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload folder" }),
  ).toBeVisible();

  // The toolbar does NOT vanish with the listing: Upload and Download all
  // stay exactly where they were, so the layout never jumps out from under
  // the user. Only the controls with nothing to act on step aside.
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search files" }),
  ).toHaveCount(0);

  // Its CTA uploads like the header's does, and the listing takes over.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Browse files" }).click(),
  ]);
  await chooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# the first file"),
  });
  await expect(page.getByText("notes.md")).toBeVisible();
  await expect(page.getByText("No files yet")).toHaveCount(0);
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

test("a move that collides on a name offers Keep both instead of erroring", async ({
  page,
}) => {
  await openFilesTab(page);

  // Move the root PDF into Docs (no conflict yet).
  await page
    .getByText("Q3 report.pdf")
    .dragTo(page.getByText("Docs", { exact: true }));
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);

  // Re-create the same name at the root.
  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "Q3 report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 second"),
  });
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();

  // Dropping it onto Docs now collides: the dialog offers choices, no toast.
  await page
    .getByText("Q3 report.pdf")
    .dragTo(page.getByText("Docs", { exact: true }));
  await expect(page.getByRole("dialog")).toContainText("already exists");
  await page.getByRole("button", { name: "Keep both" }).click();

  // Both live in Docs, the newcomer under a numbered name.
  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("Q3 report (1).pdf")).toBeVisible();
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
