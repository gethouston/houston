import { FAKE_HOST_URL } from "@houston/fake-host";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

/**
 * The Files tab on the host adapter: the default Drive-style card grid with
 * per-folder navigation and its own breadcrumb row, the Finder-style list view
 * behind the toggle (rooted at the workspace and browsed by expanding folder
 * rows, so it needs no trail), and the two gestures the redesign separated —
 * a CLICK opens a file (the in-browser preview dialog), while the list's gutter
 * CHECKBOX is the only way to select one. Everything that adds to the workspace
 * now lives behind one filled "New" pill (upload files, upload a folder, new
 * folder); the rest of the toolbar is quiet icon-only chrome. Also covered:
 * header search (scoped to the folder in the grid, tree-wide in the list),
 * per-row kebabs, the named single delete and the counted batch delete, the
 * client-side upload size cap (HOU-970), and the browser-mode "Download all"
 * (reveal-in-OS only exists on a co-located desktop). The fake host models the
 * real host's `files*` routes (see `@houston/fake-host` routes-files.ts).
 */

async function openFilesTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  // Seeded workspace: Q3 report.pdf + Docs/sales.csv.
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
}

/**
 * Every upload starts at the toolbar's one filled pill: open the New menu, pick
 * an item, resolve the filechooser it opens.
 */
async function openUploadChooser(
  page: import("@playwright/test").Page,
  item: "Upload files" | "Upload folder",
) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    (async () => {
      await page.getByRole("button", { name: "New", exact: true }).click();
      await page.getByRole("menuitem", { name: item }).click();
    })(),
  ]);
  return chooser;
}

/** Start an inline new-folder card/row from the New menu, the only entry point. */
async function startNewFolder(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
}

/** Create a folder at the current level and wait for it to land. */
async function createFolder(
  page: import("@playwright/test").Page,
  name: string,
) {
  await startNewFolder(page);
  const input = page.getByPlaceholder("untitled folder");
  await expect(input).toBeVisible();
  await input.fill(name);
  await input.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * "Move to Trash" asks first (HOU-970): the context menu opens a confirm
 * dialog NAMING the target, and only its button actually deletes.
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

/** A row of the list view, by the name it shows. */
function listRow(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

/** A 1x1 PNG: the smallest real image a thumbnail can be painted from. */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("grid is the default: cards, folder navigation, breadcrumbs", async ({
  page,
}) => {
  await openFilesTab(page);

  // Grid mode is on by default (toggle pressed) and shows no column headers.
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Modified" })).toHaveCount(0);

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

test("never shows the previous agent's files while the next read is in flight", async ({
  page,
  request,
}) => {
  await page.goto("/");

  // Create the target before arming the held reads, then return to the seeded
  // agent and reload so the target's files query is cold when selected.
  await createAgent(page, "Research Bot");
  await page
    .getByRole("button", { name: "Houston", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();

  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms: 8_000 },
  });
  await page
    .getByRole("button", { name: "Research Bot", exact: true })
    .last()
    .click();

  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0, {
    timeout: 3_000,
  });
  await expect(page.getByText("sales.csv")).toHaveCount(0, { timeout: 3_000 });
  await expect(
    page.getByRole("navigation", { name: "Folder path" }).getByText("Docs"),
  ).toHaveCount(0, { timeout: 3_000 });
});

test("the trail is a grid row that only appears once you are inside a folder", async ({
  page,
}) => {
  await openFilesTab(page);

  // At the workspace root the band is the toolbar alone: a lone root crumb
  // repeats what the pane already says and costs a whole row of chrome.
  const crumbs = page.getByRole("navigation", { name: "Folder path" });
  await expect(crumbs).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Search files" });
  const searchBox = await search.boundingBox();

  // Search fills its slot up to a CAP and then stops: a field stretched across
  // a wide window reads as a search engine rather than as a filter over the
  // listing. Every pixel past the cap becomes gutter, and the control cluster
  // stays anchored to the pane's right edge.
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const tabsBefore = await page
    .getByRole("button", { name: "Grid view" })
    .boundingBox();
  await page.setViewportSize({ ...viewport, width: viewport.width + 320 });
  const widened = await search.boundingBox();
  const tabsAfter = await page
    .getByRole("button", { name: "Grid view" })
    .boundingBox();
  expect(widened?.width ?? 0).toBeLessThanOrEqual(448);
  expect(widened?.width ?? 0).toBeCloseTo(searchBox?.width ?? 0, 0);
  expect((tabsAfter?.x ?? 0) - (tabsBefore?.x ?? 0)).toBeCloseTo(320, 0);
  await page.setViewportSize(viewport);

  // Exactly one control in the band is loud, and it is the one that CREATES.
  // The other two carry no text at all, so what they do has to live in their
  // accessible name: sort names the key it is currently on, and the secondary
  // glyph names the action it performs in this build.
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeVisible();
  const sort = page.getByRole("button", { name: "Sort by: Name" });
  await expect(sort).toBeVisible();
  await expect(sort).toHaveText("");
  await expect(page.getByRole("button", { name: "Download all" })).toHaveText(
    "",
  );

  // Walking in earns the trail its row: root + the open folder, emphasized,
  // on its own line UNDER the utilities rather than squeezed beside them.
  await page.getByText("Docs", { exact: true }).click();
  await expect(crumbs.getByRole("button")).toHaveCount(2);
  await expect(crumbs.getByRole("button").nth(1)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(crumbs.getByRole("button").first()).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  const crumbsBox = await crumbs.boundingBox();
  expect(crumbsBox?.y ?? 0).toBeGreaterThanOrEqual(
    (searchBox?.y ?? 0) + (searchBox?.height ?? 0),
  );

  // The list has no path to state: it always shows the whole workspace, so
  // the row goes away again the moment you toggle into it.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(crumbs).toHaveCount(0);
});

test("the toolbar is one 36px band of search, New and the view tabs", async ({
  page,
}) => {
  await openFilesTab(page);

  // Chrome sits above the listing without competing with it: search, the New
  // pill, the secondary glyph and the view tabs are all one 36px control
  // height. There is no second header here, and no strip of rival buttons.
  for (const control of [
    page.getByRole("searchbox", { name: "Search files" }),
    page.getByRole("button", { name: "New", exact: true }),
    page.getByRole("button", { name: "Download all" }),
    page.getByRole("button", { name: "Grid view" }).locator(".."),
  ]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeCloseTo(36, 0);
  }

  // The tabs stay comfortably clickable (>=24px hit target) rather than
  // shrinking to the size of their glyph.
  const gridTab = page.getByRole("button", { name: "Grid view" });
  const inGrid = await gridTab.boundingBox();
  expect(inGrid?.height ?? 0).toBeGreaterThanOrEqual(24);

  // Sort belongs to the grid (the list sorts from its column headers), but its
  // slot is held open in BOTH views: a slot that collapsed would slide the tabs
  // out from under the cursor on every single toggle.
  await expect(page.getByRole("button", { name: "Sort by: Name" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("button", { name: "Sort by: Name" })).toHaveCount(
    0,
  );
  const inList = await gridTab.boundingBox();
  expect(inList?.x ?? 0).toBeCloseTo(inGrid?.x ?? 0, 0);
});

test("the grid groups folders above files, and both views fill the pane", async ({
  page,
}) => {
  await openFilesTab(page);

  // Drive-style grouping: folders are one-line chips on their own row ABOVE
  // the files, which are hero cards whose preview is the point of the card.
  const chip = page.getByRole("button", { name: /^Docs/ });
  const card = page.getByRole("button", { name: "Q3 report.pdf" });
  const chipBox = await chip.boundingBox();
  const cardBox = await card.boundingBox();
  expect(chipBox?.height ?? 0).toBeLessThan(60);
  expect(cardBox?.height ?? 0).toBeGreaterThan(200);
  expect((chipBox?.y ?? 0) + (chipBox?.height ?? 0)).toBeLessThanOrEqual(
    cardBox?.y ?? 0,
  );

  // Full width: rows stretch across the whole pane. The old centered reading
  // column capped every state at 896px, wasting half a desktop window.
  await page.getByRole("button", { name: "List view" }).click();
  const rowBox = await page.getByRole("row").first().boundingBox();
  expect(rowBox?.width ?? 0).toBeGreaterThan(
    (page.viewportSize()?.width ?? 0) * 0.7,
  );
});

test("list view is exactly Name, Modified, Size and the kebab", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // The three columns, and nothing else: a file's TYPE is now carried by its
  // icon tile, so Kind (and Date Created) no longer take a column each.
  for (const col of ["Name", "Modified", "Size"]) {
    await expect(page.getByRole("button", { name: col })).toBeVisible();
  }
  for (const gone of ["Date Created", "Kind"]) {
    await expect(page.getByRole("button", { name: gone })).toHaveCount(0);
  }
  await expect(page.getByText("PDF Document")).toHaveCount(0);

  // Friendly dates: the seeded files are from January 2024, so they state
  // month, day and YEAR (the day itself depends on the runner's timezone,
  // since the seed timestamp is UTC midnight).
  await expect(listRow(page, "Q3 report.pdf")).toContainText(
    /Jan \d{1,2}, 2024/,
  );
  await expect(page.getByText("Docs", { exact: true })).toBeVisible();

  // Browser build: no OS file manager. The band offers the New pill and a
  // download-all glyph that says what it is only through its accessible name,
  // never "Open in File Manager".
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeVisible();
  const downloadAll = page.getByRole("button", { name: "Download all" });
  await expect(downloadAll).toBeVisible();
  await expect(downloadAll).toHaveText("");
  await expect(page.getByText("Open in File Manager")).toHaveCount(0);
});

test("list view shows the whole workspace, whatever folder the grid has open", async ({
  page,
}) => {
  await openFilesTab(page);

  // Enter a folder in the grid, then switch: the list is rooted at the
  // workspace, so it shows the root file AND the folder's contents inline.
  // With no trail in this view, expansion is the only way to browse.
  await page.getByText("Docs", { exact: true }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("sales.csv")).toBeVisible();

  // Collapsing the folder row hides its subtree; expanding brings it back.
  const docsRow = listRow(page, "Docs");
  await docsRow.click();
  await expect(page.getByText("sales.csv")).toHaveCount(0);
  await docsRow.click();
  await expect(page.getByText("sales.csv")).toBeVisible();

  // Toggling back returns to the folder the grid still remembers.
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Folder path" })
      .getByText("Docs", { exact: true }),
  ).toBeVisible();
});

test("a click on a file opens the preview and selects nothing", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // One click OPENS. The old model made a click select a row and do nothing
  // else, which is a dead click on a library of documents.
  const row = listRow(page, "Q3 report.pdf");
  await row.click();
  await expect(
    page.getByRole("dialog", { name: "Q3 report.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // And it really was only an open: nothing got checked on the way, so the
  // column headers never handed their slot to a selection bar.
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();

  // Enter on the focused row does the same. It used to start a rename, which
  // is now only reachable from the kebab and the right-click menu.
  await row.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Q3 report.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A grid card behaves identically: same gesture, same result.
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.getByRole("button", { name: "Q3 report.pdf" }).click();
  await expect(
    page.getByRole("dialog", { name: "Q3 report.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A folder is not a file: clicking one still walks INTO it, and opens
  // nothing.
  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an HTML file previews as a rendered page, not raw markup", async ({
  page,
}) => {
  await openFilesTab(page);

  // People build presentations as HTML files; the preview must render the
  // document (scripts and all), never dump its source as text.
  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "deck.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      "<h1>Launch plan</h1><script>document.title = 'ran'</script>",
    ),
  });
  await expect(page.getByText("deck.html")).toBeVisible();

  await page.getByText("deck.html", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "deck.html" });
  await expect(dialog).toBeVisible();

  // A deck gets the whole viewport, not a document-sized modal: most HTML
  // files are presentations, and horizontal layout needs the window's shape.
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(viewport.width * 0.9);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(viewport.height * 0.85);

  // A rendered document inside a sandboxed frame: scripts may run, but the
  // deck must never share the app's origin (no allow-same-origin, ever).
  const iframe = dialog.locator("iframe");
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  const frame = iframe.contentFrame();
  await expect(
    frame.getByRole("heading", { name: "Launch plan" }),
  ).toBeVisible();

  // And no source dump anywhere: the markup is not on the page as text.
  await expect(dialog.getByText("<h1>")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the checkbox gutter selects without opening anything", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // Selecting is a separate gesture on a permanent gutter, never a hover-gated
  // one: both boxes are on screen before the pointer goes anywhere near them.
  const pdf = listRow(page, "Q3 report.pdf").getByRole("checkbox");
  const csv = listRow(page, "sales.csv").getByRole("checkbox");
  await expect(pdf).toBeVisible();
  await expect(csv).toBeVisible();

  await pdf.check();
  await csv.check();

  // Two checks, and not one preview: a selection never opens a file.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The column headers hand their 40px slot to the selection bar, so the count
  // and its actions arrive without anything below them moving.
  await expect(page.getByText("2 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Modified" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toBeVisible();

  // And the way out is right there: clearing gives the columns back.
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("2 selected")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();
  await expect(pdf).not.toBeChecked();
});

test("select all is indeterminate on a partial selection and clears on a second press", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  const selectAll = page.getByRole("checkbox", { name: "Select all" });
  const pdf = listRow(page, "Q3 report.pdf").getByRole("checkbox");
  const csv = listRow(page, "sales.csv").getByRole("checkbox");

  // `indeterminate` is a DOM property with no HTML attribute, so it is only
  // true for assistive tech if it is set on the input itself. Reading the
  // property is the only assertion that proves the glyph is not lying.
  const mixed = () =>
    selectAll.evaluate((el: HTMLInputElement) => el.indeterminate);
  expect(await mixed()).toBe(false);

  // Some but not all: the dash state, and NOT a checked box, which would claim
  // the untouched file is selected too.
  await pdf.check();
  expect(await mixed()).toBe(true);
  await expect(selectAll).not.toBeChecked();

  // Every row on: the dash resolves into a real check.
  await csv.check();
  expect(await mixed()).toBe(false);
  await expect(selectAll).toBeChecked();

  // Pressing it while everything is on means "none": all off, columns back.
  await selectAll.uncheck();
  await expect(pdf).not.toBeChecked();
  await expect(csv).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();
});

test("only files carry a checkbox, folders deliberately do not", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // Deleting a folder takes everything inside it, which is a heavier act than
  // a batch of files and keeps its own named confirm. So a folder row's gutter
  // stays empty: it holds the column open, it is not an offer.
  const docs = listRow(page, "Docs");
  await expect(docs.getByRole("checkbox")).toHaveCount(0);
  await expect(listRow(page, "sales.csv").getByRole("checkbox")).toHaveCount(1);

  // Clicking the folder row still only expands and collapses it: no selection
  // appears out of a gesture that was never one.
  await docs.click();
  await expect(page.getByText("sales.csv")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();
});

test("a batch delete asks once and takes them all", async ({ page }) => {
  await openFilesTab(page);

  // A third file, so the listing (and its column headers) survive the batch
  // and the selection bar's disappearance is observable.
  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# kept"),
  });
  await expect(page.getByText("notes.md")).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();
  const pdf = listRow(page, "Q3 report.pdf").getByRole("checkbox");
  const csv = listRow(page, "sales.csv").getByRole("checkbox");
  await pdf.check();
  await csv.check();

  // ONE question for the whole batch, and it COUNTS instead of naming: no
  // single name is truthful for a set the user built over several clicks.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Move 2 items to Trash?");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  // Cancelling is a true no-op: every check stays exactly where it was put.
  await expect(page.getByText("2 selected")).toBeVisible();
  await expect(pdf).toBeChecked();
  await expect(csv).toBeChecked();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Move to Trash" })
    .click();

  // Both are gone in one pass, and the selection empties itself: it is derived
  // against the listing, so a deleted path cannot stay checked.
  await expect(page.getByText("Q3 report.pdf")).toHaveCount(0);
  await expect(page.getByText("sales.csv")).toHaveCount(0);
  await expect(page.getByText("notes.md")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();
});

test("an image row shows its own thumbnail, other types keep the type tile", async ({
  page,
}) => {
  await openFilesTab(page);

  // The seed has no image, so upload a real (1x1) PNG through the New menu.
  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG, "base64"),
  });
  await expect(page.getByText("shot.png")).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();

  // A library of photos should look like the photos: the row's 32px icon slot
  // becomes the image itself.
  await expect(listRow(page, "shot.png").locator("img")).toHaveCount(1);

  // Everything else keeps the outlined type tile, whose tint is what lets a
  // column of filenames read as "a PDF and a spreadsheet" at a glance.
  const pdfRow = listRow(page, "Q3 report.pdf");
  await expect(pdfRow.locator("img")).toHaveCount(0);
  expect(await pdfRow.locator("svg").count()).toBeGreaterThan(0);
});

test("the New menu is the single way into uploads and folders", async ({
  page,
}) => {
  await openFilesTab(page);

  // Exactly one loud control in the band, and it is the one that creates: the
  // separate Upload pill and New folder button are gone, not merely restyled.
  const newPill = page.getByRole("button", { name: "New", exact: true });
  await expect(newPill).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New folder" })).toHaveCount(0);

  // "Filled" is the whole point of the hierarchy, so assert the paint: the
  // pill carries an opaque fill while the secondary glyph beside it does not.
  const fill = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill(newPill)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await fill(page.getByRole("button", { name: "Download all" }))).toBe(
    "rgba(0, 0, 0, 0)",
  );

  // All three ways of adding something live behind it in the browser build.
  await newPill.click();
  for (const item of ["Upload files", "Upload folder", "New folder"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
});

test("the list draws no rules at all: rows are objects a hover paints", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  const borderBottom = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => getComputedStyle(el).borderBottomWidth);
  const fill = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);

  // The header band is the toolbar's wrapper (tabs -> the toggle -> the
  // toolbar row -> the band) and the column-header row is the grid itself.
  // Neither draws a floor: vertical rhythm comes from spacing, and a full-bleed
  // hairline across a borderless page was the loudest thing on it.
  const band = page
    .getByRole("button", { name: "Grid view" })
    .locator("../../..");
  const columnHeaders = page
    .getByRole("button", { name: "Name" })
    .locator("..");
  expect(await borderBottom(band)).toBe("0px");
  expect(await borderBottom(columnHeaders)).toBe("0px");

  // Nor do the rows. The separator between two files is the height of the rows
  // themselves; nothing is drawn until the pointer arrives.
  const row = listRow(page, "Q3 report.pdf");
  const nameCell = row.locator("> div > div");
  expect(await borderBottom(row)).toBe("0px");
  expect(await borderBottom(nameCell)).toBe("0px");

  // At rest the row is transparent; hovering paints the one fill on the page,
  // and it is ROUNDED — the same 12px language as the grid's cards.
  expect(await fill(row)).toBe("rgba(0, 0, 0, 0)");
  await row.hover();
  await expect.poll(() => fill(row)).not.toBe("rgba(0, 0, 0, 0)");
  expect(
    await row.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
  ).toBe("12px");
});

test("a checked row reads as checked without counting checkboxes", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  const fill = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const row = listRow(page, "Q3 report.pdf");
  expect(await fill(row)).toBe("rgba(0, 0, 0, 0)");

  // Checking paints a quiet fill that survives the pointer moving away, so a
  // selection is legible from across the pane rather than from a 16px box.
  await row.getByRole("checkbox").check();
  await page.mouse.move(0, 0);
  await expect.poll(() => fill(row)).not.toBe("rgba(0, 0, 0, 0)");
});

test("a list search reaches the whole tree, a grid search stays in the folder", async ({
  page,
}) => {
  await openFilesTab(page);

  // Inside Docs, the grid only knows about what is in Docs.
  await page.getByText("Docs", { exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search files" });
  await search.fill("q3");
  await expect(page.getByText("No files match your search")).toBeVisible();

  // The list filters from the root, so the same query finds the root's PDF
  // even though the grid is still parked inside Docs.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
});

test("per-row kebabs reach rename and delete without a right-click", async ({
  page,
}) => {
  await openFilesTab(page);
  await page.getByRole("button", { name: "List view" }).click();

  // A folder row is a row, not a button: role="button" prunes its children,
  // which would hide the row's own kebab from assistive tech entirely.
  const folderKebab = listRow(page, "Docs").getByRole("button", {
    name: "More actions",
  });
  await folderKebab.click();
  await expect(page.getByRole("menu").getByText("Rename")).toBeVisible();
  await expect(page.getByRole("menu").getByText("Move to Trash")).toBeVisible();
  await page.keyboard.press("Escape");

  // A file row's kebab does the same, and rename works straight from it. This
  // is now the ONLY way into a rename: the row's own Enter opens the file.
  const fileKebab = listRow(page, "Q3 report.pdf").getByRole("button", {
    name: "More actions",
  });

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
  // the menu item stayed live and did visibly nothing.
  await search.fill("zzz");
  await expect(page.getByText("No files match your search")).toBeVisible();
  await startNewFolder(page);

  // The query steps aside and the inline card is actually there to type in.
  await expect(search).toHaveValue("");
  const name = page.getByPlaceholder("untitled folder");
  await expect(name).toBeVisible();
  await name.fill("Drafts");
  await name.press("Enter");
  await expect(page.getByText("Drafts", { exact: true })).toBeVisible();
});

test("an empty folder states itself in both views", async ({ page }) => {
  await openFilesTab(page);
  await createFolder(page, "Drafts");

  // Grid: opening it replaces the listing with the empty-folder state.
  await page.getByText("Drafts", { exact: true }).click();
  await expect(page.getByText("This folder is empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Modified" })).toHaveCount(0);

  // List: the workspace still has files, so the columns stay — but the folder
  // row expands onto a quiet notice instead of an open chevron over nothing.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("button", { name: "Modified" })).toBeVisible();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("This folder is empty")).toBeVisible();

  // Collapsing the row takes the notice with it.
  await listRow(page, "Drafts").click();
  await expect(page.getByText("This folder is empty")).toHaveCount(0);
});

test("uploads a file through the New menu", async ({ page }) => {
  await openFilesTab(page);

  const chooser = await openUploadChooser(page, "Upload files");
  await chooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# uploaded from the files tab"),
  });

  // The upload lands in the fake host's workspace and the grid refreshes.
  await expect(page.getByText("notes.md")).toBeVisible();
  // Just-uploaded, so the Modified cell says Today rather than a date.
  await page.getByRole("button", { name: "List view" }).click();
  await expect(listRow(page, "notes.md")).toContainText("Today");
});

test("the New menu lands the file in the open folder, not the root", async ({
  page,
}) => {
  await openFilesTab(page);

  // Walk into a folder first: the menu has to follow you in, the way a drop
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

  // A folder created and entered on the spot: its own inline CTA is the
  // shortest way to fill it, and it must target the folder, not the root.
  await createFolder(page, "Drafts");
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

  const card = page.getByText("Q3 report.pdf");
  await card.click({ button: "right" });
  // Browser mode: Preview + Download (no reveal). Rename swaps in an inline
  // input, and this menu is now the ONLY place rename lives.
  await expect(page.getByRole("menu").getByText("Preview")).toBeVisible();
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
  // Guard the fill before committing: the rename field selects its basename a
  // frame after mounting, and when that frame lands mid-fill the inserted text
  // only replaced the selection ("Q3 final.pdf.pdf"). Substring matchers below
  // would let that corruption slide to a confusing dialog assertion.
  await expect(input).toHaveValue("Q3 final.pdf");
  await input.press("Enter");
  await expect(page.getByText("Q3 final.pdf", { exact: true })).toBeVisible();

  // Deleting is confirmed first, by NAME, and cancelling leaves the file alone.
  await page.getByText("Q3 final.pdf").click({ button: "right" });
  await page.getByRole("menu").getByText("Move to Trash").click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Move “Q3 final.pdf” to Trash?",
  );
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

  // The toolbar does NOT vanish with the listing: New and the download-all
  // glyph stay exactly where they were, so the layout never jumps out from
  // under the user, and creating the first folder here is still possible. Only
  // the controls with nothing to act on step aside.
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search files" }),
  ).toHaveCount(0);
  // No trail either: there is no folder to be inside of, so the band is the
  // toolbar alone, exactly as it is at a populated root.
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);

  // Its CTA uploads like the New menu does, and the listing takes over.
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

test("the New menu creates a folder in the open folder", async ({ page }) => {
  await openFilesTab(page);

  await page.getByText("Docs", { exact: true }).click();
  await expect(page.getByText("sales.csv")).toBeVisible();
  await createFolder(page, "Drafts");

  // It really nested: the root does not have it.
  await page
    .getByRole("navigation", { name: "Folder path" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(page.getByText("Drafts", { exact: true })).toHaveCount(0);
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

test("the icon-only Download all saves the whole workspace as one zip", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "no download events on Playwright WebKit",
  );
  await openFilesTab(page);

  // Named only by its aria-label now, and still doing the real work.
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
