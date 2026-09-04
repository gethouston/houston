import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import {
  newTaskButton,
  openPhoneTeamSection,
  teamSettingsTab,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone's team Tasks list: below 768px a team's board is a LIST, not a
 * pager. The same missions the columns hold, grouped Needs you / Running /
 * Done as shared task rows, under the segmented control the per-agent list
 * wears, with search, the archive and Team settings behind the drilled
 * header's "…" menu.
 *
 * The screen is reached the way the phone reaches every team section — the
 * Teams tree, one row per section — and it carries a back chip rather than a
 * section switcher.
 */

const AGENT = "houston-assistant";

test("the list groups the seeded missions by section, with their status glyphs", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  const list = screen(page).getByTestId("team-task-list");
  await expect(list).toBeVisible();
  // The pager and its control row are gone, not hidden: nothing on the phone
  // renders a squeezed board any more.
  await expect(page.getByTestId("board-pager")).toHaveCount(0);
  await expect(page.getByTestId("mobile-board-controls")).toHaveCount(0);
  await expect(page.getByTestId("board-columns")).toHaveCount(0);

  // Two seeded missions, one per band, each named once by its heading.
  await expect(list.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(list.getByTestId("team-task-row")).toHaveText([
    /Plan a trip to Tokyo/,
    /Draft the launch email/,
  ]);
  // The glyph is the only thing that names a row's state, so it says so.
  await expect(list.getByRole("img", { name: "Needs you" })).toHaveCount(1);
  await expect(list.getByRole("img", { name: "Done" })).toHaveCount(1);

  // No section switcher anywhere on the phone team screen — the Teams tree one
  // level up chose the section, and the screen retreats to it by chip.
  await expect(screen(page).locator("[data-team-section-tab]")).toHaveCount(0);
  await expect(
    screen(page).locator("[data-team-section-switcher]"),
  ).toHaveCount(0);
  await expect(screen(page).getByTestId("team-mobile-back")).toBeVisible();
  // ONE compose in the chrome: the nav bar's. The list carries none.
  await expect(list.getByRole("button", { name: "New task" })).toHaveCount(0);
  await expect(newTaskButton(page)).toBeVisible();
});

test("the segmented control narrows the list to one band", async ({ page }) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  const list = screen(page).getByTestId("team-task-list");
  const segment = (filter: string) =>
    screen(page).locator(
      `[data-testid='team-task-filter'][data-filter='${filter}']`,
    );
  await expect(segment("all")).toHaveAttribute("aria-selected", "true");
  // The one seeded needs-you mission is the segment's count.
  await expect(segment("needs_you")).toContainText("1");

  await segment("done").tap();
  await expect(segment("done")).toHaveAttribute("aria-selected", "true");
  await expect(list.getByTestId("team-task-row")).toHaveText([
    /Draft the launch email/,
  ]);
  await expect(list.getByRole("heading", { name: "Needs you" })).toHaveCount(0);

  // A band with nothing in it says so rather than standing hollow.
  await segment("running").tap();
  await expect(list.getByTestId("team-task-row")).toHaveCount(0);
  await expect(list.getByText("No tasks in this view")).toBeVisible();
});

test("the header menu reveals search, the archive and Team settings", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");
  const list = screen(page).getByTestId("team-task-list");

  // Search hides behind the menu: the screen's first line belongs to tasks.
  await expect(screen(page).getByTestId("team-task-search")).toHaveCount(0);
  await screen(page).getByTestId("team-tasks-menu").tap();
  await page.getByTestId("team-tasks-menu-search").click();
  const field = screen(page).getByTestId("team-task-search");
  await expect(field).toBeVisible();
  await field.fill("launch");
  await expect(list.getByTestId("team-task-row")).toHaveText([
    /Draft the launch email/,
  ]);
  await field.fill("");

  // Archived swaps in the archive surface, with its own way back.
  await screen(page).getByTestId("team-tasks-menu").tap();
  await page.getByTestId("team-tasks-menu-archived").click();
  await expect(
    screen(page).getByRole("button", { name: "Back to tasks" }),
  ).toBeVisible();
  // No list under the header any more, so the header drops its chip too.
  await expect(screen(page).getByTestId("team-tasks-menu")).toHaveCount(0);
  await screen(page).getByRole("button", { name: "Back to tasks" }).tap();
  await expect(list).toBeVisible();

  // The seeded caller is single-player, so they manage the team: the third
  // item is theirs, and it lands on the drilled settings level's first
  // section rather than back on the tasks.
  await screen(page).getByTestId("team-tasks-menu").tap();
  await page.getByTestId("team-tasks-menu-settings").click();
  await expect(
    screen(page).getByTestId("team-settings-mobile-back"),
  ).toBeVisible();
  await expect(
    screen(page)
      .locator("p")
      .filter({ hasText: /^Team Settings$/ }),
  ).toHaveCount(1);
  await expect(teamSettingsTab(page, "context")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a row tap pushes the chat, and back returns to the list", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  await screen(page).getByText("Plan a trip to Tokyo").tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await chat.getByTestId("mission-chat-back").tap();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(screen(page).getByTestId("team-task-list")).toBeVisible();
});

test("the nav bar's New task composes from the team screen", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  await newTaskButton(page).tap();
  // One seeded agent on the team: the flow skips the picker and pushes the
  // draft chat straight away.
  const chat = page.getByTestId("mission-chat-screen");
  await expect(
    chat.getByPlaceholder("What should the agent work on?"),
  ).toBeVisible();
});

test("a running mission joins the list under its own band", async ({
  page,
  request,
}) => {
  // The seed holds no running mission: add one through the host's own route
  // before the app boots, so all three bands have real content.
  await request.post(`${FAKE_HOST_URL}/agents/${AGENT}/activities`, {
    data: { id: "act-running", title: "Checking emails", status: "running" },
  });
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  const list = screen(page).getByTestId("team-task-list");
  await expect(list.getByRole("heading", { name: "Running" })).toBeVisible();
  await expect(list.getByText("Checking emails")).toBeVisible();
  await expect(list.getByRole("img", { name: "Running" })).toHaveCount(1);
});
