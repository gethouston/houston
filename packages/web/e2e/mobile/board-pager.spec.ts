import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { newTaskButton, openPhoneTeamSection } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone board pager: below 768px a team's Tasks board is one full-width
 * column per swipe with a segmented control on top, a sticky control row
 * (search, archived), honest empty pages led by the board's own "+", and card
 * taps that push the chat screen.
 *
 * The board is reached the way the phone reaches every team section now — the
 * Teams tree, one row per section — and the screen it pushes carries a back
 * chip rather than a section switcher.
 */

const AGENT = "houston-assistant";

test("the board pages between columns via the segmented control", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  const pager = screen(page).getByTestId("board-pager");
  await expect(pager).toBeVisible();
  // The first page (Running) starts active; the seed has nothing running, so
  // the page says so instead of standing hollow.
  await expect(pager.locator("[data-board-page='running']")).toHaveAttribute(
    "aria-current",
    "true",
  );
  const hint = screen(page).getByText("Nothing is running right now.");
  await expect(hint).toBeInViewport();

  // The pager is the ONE place a section is named: the paged column draws no
  // header of its own, so "Running" appears once on the screen.
  await expect(screen(page).getByText("Running", { exact: true })).toHaveCount(
    1,
  );

  // The page's "+" LEADS the page, above the empty hint, never below the fold.
  const add = screen(page)
    .getByTestId("board-columns")
    .getByRole("button", { name: "New task" });
  await expect(add).toBeInViewport();
  const [addBox, hintBox] = await Promise.all([
    add.boundingBox(),
    hint.boundingBox(),
  ]);
  expect(addBox && hintBox && addBox.y + addBox.height <= hintBox.y).toBe(true);

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
  await openPhoneTeamSection(page, "mission-control");

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
  await openPhoneTeamSection(page, "mission-control");

  const controls = screen(page).getByTestId("mobile-board-controls");
  await expect(controls).toBeVisible();
  // One seeded agent: no filter bar (a single-agent board has nothing to ask).
  await expect(
    screen(page).getByTestId("mobile-board-agent-filter"),
  ).toHaveCount(0);
  // ONE compose in the chrome: the nav bar's. The control row carries none.
  await expect(controls.getByRole("button", { name: "New task" })).toHaveCount(
    0,
  );
  await expect(newTaskButton(page)).toBeVisible();
  // No section switcher anywhere on the phone team screen — the Teams tree one
  // level up chose the section, and the screen retreats to it by chip.
  await expect(screen(page).locator("[data-team-section-tab]")).toHaveCount(0);
  await expect(
    screen(page).locator("[data-team-section-switcher]"),
  ).toHaveCount(0);
  await expect(screen(page).getByTestId("team-mobile-back")).toBeVisible();

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
  await openPhoneTeamSection(page, "mission-control");

  const pager = screen(page).getByTestId("board-pager");
  await expect(pager.locator("[data-board-page='running']")).toContainText(
    "Running",
  );
  await expect(pager.locator("[data-board-page='running']")).toContainText("1");
  await expect(screen(page).getByText("Checking emails")).toBeInViewport();
});
