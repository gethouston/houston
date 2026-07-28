import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  openSettings,
  openSettingsSection,
  settingsRow,
} from "./support/settings-nav";

/**
 * The Settings information architecture (HOU-788). Usage (now Time worked),
 * Permissions and Admin used to be their own sidebar entries; they are Settings
 * sections now. Three things must hold, and each of them broke a real user path
 * when it didn't:
 *
 * 1. the sidebar carries exactly the five top-level entries and none of the
 *    three moved ones;
 * 2. each moved section opens from the Settings index and shows exactly ONE back
 *    affordance (its own bar returns to the index, so no double chrome);
 * 3. the sidebar's Settings entry ALWAYS lands on the index, including from
 *    inside a section — otherwise it is a dead click, since the view is already
 *    `settings`.
 */

/** Teams owner on a gateway that meters running time, so all three moved
 *  sections exist: Admin + Permissions ride the role, Time worked rides
 *  `computeUsage`. */
const OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  role: "owner",
  computeUsage: true,
};

async function armOwner(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: OWNER_CAPS,
  });
  // An armed (if empty) dataset: the screen renders its roster at zero rather
  // than the honest error a 404 route would produce.
  await request.post(`${FAKE_HOST_URL}/__test__/compute-usage`, {
    data: { seed: { rows: [], awakeNow: [] } },
  });
}

test("the sidebar carries only the five top-level entries", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  for (const target of [
    "nav-dashboard",
    "nav-integrations",
    "nav-ai-hub",
    "nav-agent-store",
    "nav-settings",
  ]) {
    await expect(page.locator(`[data-tour-target="${target}"]`)).toBeVisible();
  }
  for (const target of ["nav-usage", "nav-permissions", "nav-organization"]) {
    await expect(page.locator(`[data-tour-target="${target}"]`)).toHaveCount(0);
  }
});

test("each moved surface opens from the Settings index with a single back bar", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  const cases = [
    { row: "time-worked", heading: "Time worked" },
    { row: "permissions", heading: "Permissions" },
    { row: "organization", heading: "Admin" },
  ] as const;

  for (const { row, heading } of cases) {
    await openSettingsSection(page, row);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    // Exactly one back affordance in the content pane: the section's own bar,
    // naming Settings. Two would mean the settings shell wrapped a screen that
    // already has one. Scoped to the pane because the sidebar nav entry is a
    // button named "Settings" too.
    const back = page
      .locator('[data-tour-target="main"]')
      .getByRole("button", { name: "Settings", exact: true });
    await expect(back).toHaveCount(1);
    await back.click();
    await expect(settingsRow(page, row)).toBeVisible();
  }
});

test("the sidebar Settings entry returns to the index from inside a section", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");
  await openSettingsSection(page, "permissions");
  await expect(
    page.getByRole("heading", { name: "Permissions" }),
  ).toBeVisible();

  // The view is ALREADY "settings", so this only works because opening Settings
  // clears the open section too — otherwise the click does nothing.
  await openSettings(page);
  await expect(settingsRow(page, "permissions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permissions" })).toHaveCount(
    0,
  );
});
