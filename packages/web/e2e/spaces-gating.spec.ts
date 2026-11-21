import { FAKE_HOST_URL, SEED_WORKSPACE_ID } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { setAccountPreference } from "./support/onboarding";
import {
  companyContextButton,
  expectAdminSections,
  openAdmin,
  openAdminSection,
} from "./support/settings-nav";

import { workspaceMenuTrigger } from "./support/workspace-menu";

const SPACES_OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  spaces: true,
  role: "owner",
};

const TEAMS_OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armTeamWorkspace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/workspaces`, {
    data: { teams: [TEAM] },
  });
}

const railPainted = (page: Page) =>
  expect(workspaceMenuTrigger(page)).toBeVisible();

async function switchToSpace(page: Page, name: string): Promise<void> {
  const trigger = workspaceMenuTrigger(page);
  await trigger.click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await expect(trigger.getByText(name, { exact: true })).toBeVisible();
}

test("spaces host, personal space: Admin drops People", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await page.goto("/");
  await railPainted(page);

  await openAdmin(page);
  await expectAdminSections(page, ["Org chart"]);
  await expect(companyContextButton(page)).toBeVisible();
});

test("regression: a non-spaces Teams host still shows Admin on the personal workspace", async ({
  page,
  request,
}) => {
  await armCapabilities(request, TEAMS_OWNER_CAPS);
  await page.goto("/");

  await openAdmin(page);
});

test("spaces host: switching to a team space gives Admin its People roster", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await setAccountPreference(request, "last_workspace_id", SEED_WORKSPACE_ID);
  await page.goto("/");
  await railPainted(page);

  await openAdmin(page);
  await expectAdminSections(page, ["Org chart"]);

  await switchToSpace(page, TEAM.name);

  await openAdminSection(page, "People");
  await expect(page.locator("#org-add-email")).toBeVisible();
  await expect(
    page.getByText("To invite other people, create an organization."),
  ).toHaveCount(0);
});

test("team space: inviting a fresh email through Admin > People renders a pending invite", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await switchToSpace(page, TEAM.name);

  await openAdminSection(page, "People");

  const email = "newbie@acme.test";
  await page.locator("#org-add-email").fill(email);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Pending invitations" }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test("switching back to the personal space keeps Admin reachable", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");

  await switchToSpace(page, TEAM.name);
  await openAdmin(page);

  await switchToSpace(page, "Personal");
  await openAdmin(page);
});
