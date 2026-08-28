import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone board pager (PR 5 of the responsiveness overhaul): below 768px
 * the Tasks board is one full-width column per swipe with a segmented
 * control on top, a sticky control row (search, archived, compose), honest
 * empty pages, and card taps that push the chat screen.
 */

const AGENT = "houston-assistant";

test("the board pages between columns via the segmented control", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");

  const pager = screen(page).getByTestId("board-pager");
  await expect(pager).toBeVisible();
  // The first page (Running) starts active; the seed has nothing running, so
  // the page says so instead of standing hollow.
  await expect(pager.locator("[data-board-page='running']")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    screen(page).getByText("Nothing is running right now."),
  ).toBeInViewport();

  // Tapping a segment scrolls its page in and moves the highlight.
  await pager.locator("[data-board-page='needs_you']").tap();
  await expect(pager.locator("[data-board-page='needs_you']")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeInViewport();
});

test("swiping the columns moves the segmented highlight", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();

  // A swipe is a horizontal scroll of the snap container: land on the last
  // page and the segment highlight must follow.
  await screen(page)
    .getByTestId("board-columns")
    .evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(
    screen(page).getByTestId("board-pager").locator("[data-board-page='done']"),
  ).toHaveAttribute("aria-current", "true");
});

test("the sticky control row searches the board and reaches the archive", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();

  const controls = screen(page).getByTestId("mobile-board-controls");
  await expect(controls).toBeVisible();
  // One seeded agent: no filter bar (a single-agent board has nothing to ask).
  await expect(
    screen(page).getByTestId("mobile-board-agent-filter"),
  ).toHaveCount(0);

  // Search narrows the pages' cards and their counts.
  await controls.getByRole("searchbox").fill("launch email");
  const pager = screen(page).getByTestId("board-pager");
  await expect(
    pager.locator("[data-board-page='needs_you']"),
  ).not.toContainText("1");
  await controls.getByRole("searchbox").fill("");

  // The archived toggle swaps in the archive surface, with its own way back.
  await controls.getByRole("button", { name: "Archived" }).tap();
  await expect(
    screen(page).getByRole("button", { name: "Back to tasks" }),
  ).toBeVisible();
});

test("a running mission fills the Running page with a live count", async ({
  page,
  request,
}) => {
  // The seed holds no running mission: add one through the host's own route
  // before the app boots, so the pager's first page has real content.
  await request.post(`${FAKE_HOST_URL}/agents/${AGENT}/activities`, {
    data: { id: "act-running", title: "Checking emails", status: "running" },
  });
  await page.goto("/");
  await page
    .getByTestId("mobile-tab-bar")
    .getByRole("button", { name: "Tasks" })
    .tap();

  const pager = screen(page).getByTestId("board-pager");
  await expect(pager.locator("[data-board-page='running']")).toContainText(
    "Running",
  );
  await expect(pager.locator("[data-board-page='running']")).toContainText("1");
  await expect(screen(page).getByText("Checking emails")).toBeInViewport();
});
