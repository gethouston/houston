import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "../support/identity";
import { openPhoneTeamSection } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone twin of chat-header-people.spec.ts: the pushed mission chat's
 * header shows the people stack only when someone else is on the task, and
 * a TAP (no hover on a phone) opens the roster.
 */

test.use({ baseURL: AUTH_WEB_URL });

const PEOPLE_LABEL = "People on this task";

test("solo task: no stack; team task: tap opens the roster", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "act-solo",
      title: "Connect Google Calendar",
      status: "done",
      created_by: E2E_VIEWER.uid,
      contributors: [{ user_id: E2E_VIEWER.uid, name: E2E_VIEWER.displayName }],
    },
  });
  await signInAsViewer(page);
  await openPhoneTeamSection(page, "mission-control");

  await screen(page).getByText("Connect Google Calendar").tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat.getByText("Task: Connect Google Calendar")).toBeVisible();
  await expect(
    chat.locator(`[role="group"][aria-label="${PEOPLE_LABEL}"]`),
  ).toHaveCount(0);
  await chat.getByTestId("mission-chat-back").tap();

  await screen(page).getByText("Plan a trip to Tokyo").tap();
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  const stack = chat.getByRole("button", { name: "All people" });
  await expect(stack).toBeVisible();
  await stack.tap();
  const roster = page.getByRole("dialog");
  await expect(roster.getByText("Ada Lovelace")).toBeVisible();
  await expect(roster.getByText("Bob Stone")).toBeVisible();
});
