import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import {
  openArchivedTasks,
  openTeamSection,
  returnToActiveTasks,
  screen,
} from "./support/team-nav";
import { openNavRow } from "./support/workspace-menu";

test.use({ teamBoard: true });

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

  const openArchive = screen(page).getByRole("button", { name: "Archived" });
  const wayBack = screen(page).getByRole("button", { name: "Back to tasks" });
  await expect(openArchive).toBeVisible();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);

  await openArchivedTasks(page);
  await expect(page.getByText("Quarterly review")).toBeVisible();

  await expect(wayBack).toBeVisible();
  await expect(openArchive).toHaveCount(0);

  await returnToActiveTasks(page);
  await expect(page.getByText("Quarterly review")).toHaveCount(0);
  await expect(openArchive).toBeVisible();
});

test("a team's sections SWAP, so the archive leaves no rows behind", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-reset", title: "Reset me", status: "archived" },
  });
  await page.goto("/");

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

  await openNavRow(page, "integrations");
  await openTeamSection(page, "Tasks");
  await expect(screen(page).getByText("Left open")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Archived" }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Back to tasks" }),
  ).toHaveCount(0);

  await openArchivedTasks(page);
  await expect(screen(page).getByText("Left open")).toBeVisible();
});
