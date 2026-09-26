import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { createTeam } from "./support/sidebar-create";

test("a member can create a personal team folder", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "user" },
  });
  await page.goto("/");
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
  await createTeam(page, "My work");
  await expect(page.locator("[data-sidebar-group-header]")).toContainText(
    "My work",
  );
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
});
