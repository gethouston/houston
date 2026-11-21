import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAboutMe, openCompanyContext } from "./support/settings-nav";
import { screen } from "./support/team-nav";

async function armOwner(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

async function seedEmptyContext(page: Page) {
  await page.route(/\/v1\/(workspace|user)-context$/, async (route) => {
    await route.fulfill({ json: { content: "" } });
  });
}

test("About me is the account menu's own screen", async ({ page }) => {
  await seedEmptyContext(page);
  await page.goto("/");
  await openAboutMe(page);

  await expect(
    screen(page).getByText(
      "What every AI Employee knows about you before it starts.",
    ),
  ).toBeVisible();
  await expect(screen(page).getByText(/I'm Juan/)).toBeVisible();

  await expect(
    screen(page).getByRole("button", { name: "Settings" }),
  ).toHaveCount(0);
});

test("Company context opens from the Admin header, editing the workspace's half", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await seedEmptyContext(page);
  await page.goto("/");
  const sheet = await openCompanyContext(page);

  await expect(
    sheet.getByText(
      "What all your AI Employees know on every task and routine they run.",
    ),
  ).toBeVisible();

  const editor = sheet.getByRole("textbox");
  await expect(sheet.getByText("Who we are")).toBeVisible();
  await expect(sheet.getByText("How we communicate")).toBeVisible();
  await expect(sheet.getByText("## Who we are")).toHaveCount(0);

  await expect(editor).toHaveCount(1);
  await expect(sheet.getByText(/I'm Juan/)).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(
    screen(page).locator("[data-admin-section-body='orgChart']"),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Workspace", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
