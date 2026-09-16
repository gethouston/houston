import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import { openAdminSection } from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * Admin > Org chart: who works here, humans and agents in the same frame.
 *
 * It is a section of Workspace management (Settings), not a screen of its own,
 * and it is the one place that answers "who is on this team" with the caller's
 * own face in it — so the guard is that a team card renders with the signed-in
 * person named on it and marked as them.
 *
 * Signed in on the identity-ON server, because the "(you)" marker is the
 * session's uid matched against the roster row: the fake host's own self row is
 * `u-self`, which is {@link E2E_VIEWER}'s uid, so the two line up.
 */

test.use({ baseURL: AUTH_WEB_URL });

/** A Teams owner (the Admin dashboard's gate) whose roster holds the viewer. */
async function armOwnerWithRoster(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        {
          userId: E2E_VIEWER.uid,
          role: "owner",
          displayName: E2E_VIEWER.displayName,
          email: E2E_VIEWER.email,
        },
      ],
    },
  });
}

test("the org chart draws a team card naming the signed-in person", async ({
  page,
  request,
}) => {
  await armOwnerWithRoster(request);
  await signInAsViewer(page);

  await openAdminSection(page, "Org chart");

  const chart = screen(page).locator("[data-admin-section-body='orgChart']");

  // One card per team, each headed by the team's own name — and the header is
  // the way into that team, so it is a control, not a label.
  const card = chart.getByRole("listitem").first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: /^Open / })).toBeVisible();

  // The caller is in its People strip, by name and marked as themselves: the
  // chart answers "who works here" including the person reading it.
  await expect(
    card.getByText(E2E_VIEWER.displayName, { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("(you)")).toBeVisible();

  // Both halves are labelled, so a card reads as people over the agents they
  // run rather than as one undifferentiated list.
  await expect(card.getByText("People", { exact: true })).toBeVisible();
  await expect(card.getByText("AI Employees", { exact: true })).toBeVisible();
});
