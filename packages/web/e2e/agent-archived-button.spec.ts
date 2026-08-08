import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openTeamSection, screen } from "./support/team-nav";

/**
 * The board's archived-mission control and its reset contract. There is ONE
 * archive now — the cross-agent one every board renders — so the first test
 * drives the global board and the second the team's, where leaving the section
 * unmounts it and coming back has to start on the ACTIVE board.
 *
 * The reset is NOT the unmount, though, which is what the third test pins: the
 * global Mission Control is a KEPT-ALIVE screen, so it comes back exactly as it
 * was left, archive and all, unless the surface router puts the active board
 * back (`useBoardSurfaceOnNav`). The archive is somewhere you go; it is never
 * somewhere a navigation returns you to.
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

  const archived = page.getByRole("button", { name: "Archived", exact: true });
  await expect(archived).toBeVisible();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);

  await archived.click();
  await expect(page.getByText("Quarterly review")).toBeVisible();

  // Entry and exit are separate, labelled controls: the floating Archived pill
  // is gone from the archive, and the header's back button is the way home.
  await expect(archived).toHaveCount(0);
  const back = page.getByRole("button", { name: "Back to missions" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);
  await expect(archived).toBeVisible();
});

test("leaving a team's Mission Control resets its archived view", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-reset", title: "Reset me", status: "archived" },
  });
  await page.goto("/");

  // A team's sections SWAP rather than hide, so the archive is unmounted on the
  // way out — coming back must show the active board, never the archive the
  // user left open.
  await openTeamSection(page, "Mission Control");
  await screen(page)
    .getByRole("button", { name: "Archived", exact: true })
    .click();
  await expect(screen(page).getByText("Reset me")).toBeVisible();
  await openTeamSection(page, "Files");
  await openTeamSection(page, "Mission Control");
  await expect(screen(page).getByText("Reset me")).toHaveCount(0);
});

test("leaving Mission Control for another view resets its archived board too", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-kept-alive", title: "Left open", status: "archived" },
  });
  await page.goto("/");

  const missionControl = page.locator("[data-tour-target='nav-dashboard']");
  await screen(page)
    .getByRole("button", { name: "Archived", exact: true })
    .click();
  await expect(screen(page).getByText("Left open")).toBeVisible();

  // A genuine top-level navigation and back. This screen is kept alive, so
  // nothing unmounts and nothing resets on its own — without the surface
  // router the user returns to the archive they walked away from.
  await openTeamSection(page, "Files");
  await missionControl.click();
  await expect(screen(page).getByText("Left open")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Archived", exact: true }),
  ).toBeVisible();

  // In-view toggling is untouched: the reset fires only on the way back onto
  // the glass, never while the user is standing on the board working the
  // Archived / Back pair.
  await screen(page)
    .getByRole("button", { name: "Archived", exact: true })
    .click();
  await expect(screen(page).getByText("Left open")).toBeVisible();
});
