import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
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
  // One employee, one list: no per-agent row that could fold it away.
  await expect(row(page, "Q3 report.pdf")).toBeVisible();
  await expect(page.getByRole("row", { name: /Houston files/ })).toHaveCount(0);
  // A colleague in the same group keeps their files on their own screen.
  await expect(page.getByRole("row", { name: /Kai files/ })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
});

test("folders fold in place", async ({ page }) => {
  await openFiles(page);

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
  // Not uncheck(): clearing the selection UNMOUNTS the selection bar, and
  // uncheck's post-click verification races that unmount. Click, then assert
  // the outcome — rows cleared, the bar (and its select-all) gone.
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

// `saveBlob` hands the browser a synthetic `<a download href="blob:…">` click.
// The app-level anchor safety net used to intercept it, which cancelled the
// download and window.open'd the blob into a fresh tab instead. Pin the whole
// contract: the click yields a real browser download with the file's bytes,
// and no extra page opens.
test("Download in the file preview saves the bytes and never opens a tab", async ({
  page,
  context,
}) => {
  await openFiles(page);

  const extraPages: unknown[] = [];
  context.on("page", (p) => extraPages.push(p));

  await row(page, "sales.csv").getByText("sales.csv").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("a,b")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download" }).click(),
  ]);
  // Headless Chromium names blob downloads with a GUID — assert bytes, not
  // suggestedFilename().
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toBe("a,b\n1,2\n");
  expect(extraPages).toHaveLength(0);
});

/**
 * Renaming onto a name the folder already uses is the user's state, not a
 * failure: the host refuses it with a 409 rather than overwriting the other
 * file, and the app answers from the listing it already has. The regression
 * this pins is the shape of the surface — calm authored copy, both files
 * intact — not the mechanism.
 */
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

  // Informational, NOT the red bug pair: nothing is broken, the name is simply
  // taken. `status` is the calm toast channel a screen reader hears too.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "already exists here" })
      .filter({ hasText: "Q3 report.pdf" }),
  ).toBeVisible();
  await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);

  // Neither file was lost: the rename did not happen, and the file that held
  // the name is untouched.
  await expect(row(page, "notes.txt")).toHaveCount(1);
  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  // …and the host agrees: the screen is not just optimistic about it.
  const listed = (await (
    await request.get(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/files`)
  ).json()) as Array<{ path: string }>;
  expect(listed.map((f) => f.path)).toEqual(
    expect.arrayContaining(["notes.txt", "Q3 report.pdf"]),
  );
});

/**
 * Naming a new folder after something that is already there is the same
 * state as a taken rename, and must read the same way: calm authored copy,
 * nothing lost, no bug report. The host refuses it (`createWorkspaceFolder`)
 * rather than writing a `.keep` marker under an existing file.
 */
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
  await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);

  // The file is still a file, and no folder took its name.
  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  await expect(row(page, "Q3 report.pdf")).toContainText("9 bytes");
});

/**
 * A workspace Houston cannot write to — a read-only mount, a folder whose
 * permissions were revoked — refuses every write with the host's `read_only`
 * 403. The person gets authored copy naming the remedy, not the silence of a
 * row that quietly stays put, and not the generic bug box either: the report
 * goes to us, the sentence goes to them.
 */
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
  // A FREE name, so nothing the client can see refuses it: only the host can.
  await input.fill("Q4 report.pdf");
  await input.press("Enter");

  // Scoped to the toast stack itself: a `status` role anywhere else on the page
  // (an sr-only live region, a busy spinner) is not a toast and must not stand
  // in for one, nor inflate the count below.
  const toasts = page.getByTestId("toast-container");
  const refusal = toasts
    .getByRole("status")
    .filter({ hasText: "can’t be changed right now" })
    .filter({ hasText: "Check the folder’s permissions" });
  await expect(refusal).toBeVisible();
  // The authored sentence, raised ONCE — not a stack of identical toasts, one
  // per query the refusal knocked over — and alone: the red bug channel
  // (`alert`) stays empty, because nothing in Houston broke.
  await expect(refusal).toHaveCount(1);
  await expect(toasts.getByRole("alert")).toHaveCount(0);

  // The rename did not happen, and the screen is not optimistic about it.
  await expect(row(page, "Q3 report.pdf")).toHaveCount(1);
  await expect(row(page, "Q4 report.pdf")).toHaveCount(0);
});
