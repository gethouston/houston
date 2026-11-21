import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { screen } from "./support/team-nav";
import {
  openNavRow,
  openWorkspaceMenu,
  railDestination,
} from "./support/workspace-menu";

const OWNER_CAPS = {
  integrations: ["composio"],
  multiplayer: true,
  teams: true,
  role: "owner",
};

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function openIntegrations(page: Page): Promise<void> {
  await page.goto("/");
  await openNavRow(page, "integrations");
}

test("Teams member: no Admin dashboard, but the Integrations nav opens the personal catalog", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...OWNER_CAPS, role: "user" });
  await page.goto("/");

  const integrationsNav = railDestination(page, "nav-integrations");
  await expect(integrationsNav).toBeVisible();
  await expect(railDestination(page, "nav-ai-hub")).toBeVisible();

  const menu = await openWorkspaceMenu(page);
  await expect(menu.locator('[data-tour-target="nav-settings"]')).toBeVisible();
  await expect(menu.getByTestId("rail-admin")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await integrationsNav.click();
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  await expect(
    screen(page).locator("[data-integrations-section='catalog']"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toHaveCount(0);
});

test("Integrations page: an installed app's detail modal shows no agent list", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrations(page);

  await page.getByRole("button", { name: "Gmail" }).click();

  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(page.getByText("Agents that can use this")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
});
