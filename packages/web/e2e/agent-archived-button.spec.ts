import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openArchivedTasks, openTeamSection, screen } from "./support/team-nav";

/**
 * The board's archived-mission control and its reset contract. There is ONE
 * archive — the cross-agent one every board renders — and every board belongs
 * to a team, so all three tests drive the team's.
 *
 * They pin two different exits. Leaving for another SECTION of the same team
 * unmounts the archive (the sections swap), so coming back has to start on the
 * ACTIVE board. Leaving for another TOP-LEVEL view does not: the team screen is
 * KEPT ALIVE, so it comes back exactly as it was left, archive and all, unless
 * the surface router puts the active board back (`useBoardSurfaceOnNav`). The
 * archive is somewhere you go; it is never somewhere a navigation returns you
 * to.
 */
test("the Activity archived button swaps to archived missions and back", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "archived-quarterly-review",
      title: "Quarterly review",
      status: "archived",
    },
  });
  await page.goto("/");

  const tab = screen(page).locator("[data-team-section-tab='archived']");
  await expect(tab).toBeVisible();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);

  await openArchivedTasks(page);
  await expect(page.getByText("Quarterly review")).toBeVisible();

  // HOU-1043's rule, satisfied by the shape that replaced its controls: the
  // way in and the way out are both readable at a glance, never an icon whose
  // meaning hides in a tooltip. They are now the SAME control — a labelled tab
  // that is permanently on screen and says which side of it you are on.
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Back to tasks" })).toHaveCount(
    0,
  );
  await openTeamSection(page, "Tasks");
  await expect(page.getByText("Quarterly review")).toHaveCount(0);
  await expect(tab).not.toHaveAttribute("aria-current", "page");
});

test("a team's sections SWAP, so the archive leaves no rows behind", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-reset", title: "Reset me", status: "archived" },
  });
  await page.goto("/");

  // Sections swap rather than hide, so only the section on screen runs its
  // hooks and holds its rows. An archive still mounted behind Files would keep
  // its sweep warm and its rows in the DOM, where the next spec's
  // `screen`-scoped lookup would find them.
  await openArchivedTasks(page);
  await expect(screen(page).getByText("Reset me")).toBeVisible();
  await openTeamSection(page, "Files");
  await expect(page.getByText("Reset me")).toHaveCount(0);
  await openTeamSection(page, "Tasks");
  await expect(page.getByText("Reset me")).toHaveCount(0);
});

test("leaving the board for another TOP-LEVEL view resets its archived board too", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-kept-alive", title: "Left open", status: "archived" },
  });
  await page.goto("/");

  await openArchivedTasks(page);
  await expect(screen(page).getByText("Left open")).toBeVisible();

  // A genuine TOP-LEVEL navigation and back — the case a section swap cannot
  // reach. The team screen is kept alive, so nothing unmounts and nothing
  // resets on its own: without the surface router the user returns to the
  // archive they walked away from.
  await page.locator("[data-tour-target='nav-agent-store']").click();
  await openTeamSection(page, "Tasks");
  await expect(screen(page).getByText("Left open")).toHaveCount(0);
  await expect(
    screen(page).locator("[data-team-section-tab='archived']"),
  ).not.toHaveAttribute("aria-current", "page");

  // In-view switching is untouched: the reset fires only on the way back onto
  // the glass, never while the user is standing on the screen moving between
  // its tabs.
  await openArchivedTasks(page);
  await expect(screen(page).getByText("Left open")).toBeVisible();
});
