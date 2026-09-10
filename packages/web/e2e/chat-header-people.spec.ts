import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import { missionCard, openTeamSection } from "./support/team-nav";

/**
 * The open chat's header people stack: who ELSE is on this task. It sits on
 * the left beside the agent's name, apart from the panel controls, and is a
 * button that opens the roster (a hover tooltip was its only affordance, so
 * it was dead on touch). A task nobody but the viewer is on shows no stack
 * at all: your own face as a dead control was the complaint.
 *
 * Signed in (identity-ON server) because "nobody but me" needs a viewer id.
 */

test.use({ baseURL: AUTH_WEB_URL });

const PEOPLE_LABEL = "People on this task";
const SOLO_TITLE = "Connect Google Calendar";
const TEAM_TITLE = "Plan a trip to Tokyo";

async function seed(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "act-solo",
      title: SOLO_TITLE,
      status: "done",
      created_by: E2E_VIEWER.uid,
      contributors: [{ user_id: E2E_VIEWER.uid, name: E2E_VIEWER.displayName }],
    },
  });
}

const panel = (page: import("@playwright/test").Page) =>
  page.getByTestId("mission-panel");

test("a task with only the viewer on it shows no people stack in the chat header", async ({
  page,
  request,
}) => {
  await seed(request);
  await signInAsViewer(page);
  await openTeamSection(page, "Tasks");
  await missionCard(page, SOLO_TITLE).click();
  await expect(panel(page).getByText(`Task: ${SOLO_TITLE}`)).toBeVisible();
  await expect(
    panel(page).locator(`[role="group"][aria-label="${PEOPLE_LABEL}"]`),
  ).toHaveCount(0);
  // The panel controls are still all there.
  await expect(
    panel(page).getByRole("button", { name: "Chat actions" }),
  ).toBeVisible();
  await expect(panel(page).getByTestId("panel-width-toggle")).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "Close panel" }),
  ).toBeVisible();
});

test("a team task's stack sits left of the controls and opens the roster on click", async ({
  page,
  request,
}) => {
  await seed(request);
  await signInAsViewer(page);
  await openTeamSection(page, "Tasks");
  await missionCard(page, TEAM_TITLE).click();
  await expect(panel(page).getByText(`Task: ${TEAM_TITLE}`)).toBeVisible();

  const stack = panel(page).getByRole("button", { name: "All people" });
  await expect(stack).toBeVisible();
  await expect(stack.locator('[data-slot="avatar"]')).toHaveCount(2);

  // Left of the menu: the stack belongs with the task, the controls with
  // the panel.
  const stackBox = await stack.boundingBox();
  const menuBox = await panel(page)
    .getByRole("button", { name: "Chat actions" })
    .boundingBox();
  expect(stackBox && menuBox && stackBox.x + stackBox.width <= menuBox.x).toBe(
    true,
  );

  await stack.click();
  const roster = page.getByRole("dialog");
  await expect(roster.getByText("Ada Lovelace")).toBeVisible();
  await expect(roster.getByText("Bob Stone")).toBeVisible();
});
