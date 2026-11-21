import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import {
  adminHeading,
  assistantRow,
  openAccountScreen,
  openAdmin,
  openSettings,
} from "./support/settings-nav";
import { navRow, screen } from "./support/team-nav";
import {
  openAccountMenu,
  openNavRow,
  openWorkspaceMenu,
  railDestination,
  workspaceMenuTrigger,
} from "./support/workspace-menu";

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
}

function railButton(page: Page, name: string): Locator {
  return page
    .locator("[data-tour-target='sidebar']")
    .getByRole("button", { name, exact: true });
}

function menuItem(menu: Locator, name: string): Locator {
  return menu.getByRole("menuitem", { name, exact: true });
}

test("the sidebar carries only the IA's top-level entries", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(assistantRow(page)).toBeVisible();
  await expect(sidebar.getByText("Your AI Employees")).toHaveCount(0);
  await expect(sidebar.getByText("Workspace", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByTestId("rail-add-employee")).toBeVisible();

  for (const id of ["ai-hub", "integrations"] as const) {
    await expect(navRow(page, id)).toBeVisible();
  }
  const menu = await openWorkspaceMenu(page);
  await expect(menu.getByTestId("rail-admin")).toBeVisible();
  for (const id of ["academy", "settings"] as const) {
    await expect(menu.locator(`[data-tour-target='nav-${id}']`)).toBeVisible();
  }
  for (const id of ["ai-hub", "integrations"] as const) {
    await expect(menu.locator(`[data-tour-target='nav-${id}']`)).toHaveCount(0);
  }

  for (const gone of [
    "Skills",
    "Permissions",
    "Time worked",
    "Help",
    "Report a problem",
  ]) {
    await expect(menuItem(menu, gone)).toHaveCount(0);
    await expect(railButton(page, gone)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");

  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "user" },
  });
  await page.goto("/");
  await expect(workspaceMenuTrigger(page)).toBeVisible();

  await expect(assistantRow(page)).toBeVisible();
  await expect(railDestination(page, "nav-integrations")).toBeVisible();
  const memberMenu = await openWorkspaceMenu(page);
  await expect(navRow(page, "settings")).toBeVisible();
  await expect(menuItem(memberMenu, "Academy")).toBeVisible();
  await expect(memberMenu.getByTestId("rail-admin")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openNavRow(page, "integrations");
  await expect(
    screen(page).locator("[data-integrations-section='catalog']"),
  ).toBeVisible();

  await openSettings(page);
  await expect(
    screen(page).getByRole("button", { name: /^Keyboard shortcuts/ }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: /^Skills/ }),
  ).toHaveCount(0);
});

test("Settings holds only settings, under one heading", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");
  await openSettings(page);

  const main = page.locator('[data-tour-target="main"]');
  const group = (name: string) =>
    main.getByRole("heading", { level: 2, name, exact: true });
  await expect(group("General")).toBeVisible();
  for (const heading of ["Help", "Context", "Support", "Workspace", "Team"]) {
    await expect(group(heading)).toHaveCount(0);
  }
  await expect(page.locator('[data-testid^="settings-row-"]')).toHaveCount(0);
  await expect(main.getByText("Your context")).toHaveCount(0);
  await expect(main.getByText("Workspace context")).toHaveCount(0);
  await expect(main.getByText("Keyboard shortcuts")).toBeVisible();
  await expect(main.getByText("Report bug")).toBeVisible();
  for (const gone of [/^Profile/, /^About me/]) {
    await expect(screen(page).getByRole("button", { name: gone })).toHaveCount(
      0,
    );
  }
});

test.describe("the signed-in person, from the rail's account menu only", () => {
  test.use({ baseURL: AUTH_WEB_URL });

  test("the account menu names the person, holds Sign out and opens their screens", async ({
    page,
    request,
  }) => {
    await armOwner(request);
    await signInAsViewer(page);

    await openSettings(page);
    const main = screen(page);
    await expect(
      main.getByText(E2E_VIEWER.displayName, { exact: true }),
    ).toHaveCount(0);
    await expect(main.getByText(E2E_VIEWER.email, { exact: true })).toHaveCount(
      0,
    );
    await expect(main.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    for (const gone of [/^Profile/, /^About me/]) {
      await expect(main.getByRole("button", { name: gone })).toHaveCount(0);
    }

    const sidebar = page.locator("[data-tour-target='sidebar']");
    await expect(
      workspaceMenuTrigger(page).getByText(E2E_VIEWER.displayName),
    ).toBeVisible();
    const account = await openAccountMenu(page);
    await expect(
      account.getByText(E2E_VIEWER.displayName, { exact: true }),
    ).toBeVisible();
    await expect(
      account.getByText(E2E_VIEWER.email, { exact: true }),
    ).toBeVisible();
    for (const item of ["Profile", "About me", "Sign out"]) {
      await expect(menuItem(account, item)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(sidebar.getByRole("button", { name: "Sign out" })).toHaveCount(
      0,
    );

    await openAccountScreen(page, "Profile");
    await expect(page.getByTestId("profile-name-input")).toBeVisible();
    await openAccountScreen(page, "About me");
  });
});

test("Admin opens from its rail row without a back control", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  await openAdmin(page);
  await expect(adminHeading(page)).toBeVisible();
  await expect(
    screen(page)
      .getByTestId("page-header")
      .getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
});

test("the sidebar Settings entry returns to the index from inside a section", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");
  await openSettings(page);

  const main = page.locator('[data-tour-target="main"]');
  const sectionHeading = main.getByRole("heading", {
    name: "Keyboard shortcuts",
  });
  await main.getByText("Keyboard shortcuts").click();
  await expect(sectionHeading).toBeVisible();

  await openSettings(page);
  await expect(sectionHeading).toHaveCount(0);
});
