import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import { openAccountScreen } from "./support/settings-nav";
import { openAccountMenu } from "./support/workspace-menu";

test.use({ baseURL: AUTH_WEB_URL });

const SELF = {
  userId: E2E_VIEWER.uid,
  email: E2E_VIEWER.email,
  role: "owner",
  displayName: E2E_VIEWER.displayName,
};
const BOB = {
  userId: "u-bob",
  email: "bob@acme.test",
  role: "user",
  displayName: "Bob Stone",
};

const NEW_NAME = "Ada Astra";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function armSpace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [SELF, BOB] },
  });
}

async function openProfile(page: Page): Promise<void> {
  await signInAsViewer(page);
  await openAccountScreen(page, "Profile");
  await expect(page.getByTestId("profile-name-input")).toBeVisible();
}

async function expectAccountMenuNamed(page: Page, name: string): Promise<void> {
  const menu = await openAccountMenu(page);
  await expect(menu.getByText(name, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}

test("a display name the user picks becomes the name Houston shows them", async ({
  page,
  request,
}) => {
  await armSpace(request);
  await openProfile(page);

  const field = page.getByTestId("profile-name-input");
  await expect(field).toHaveValue(E2E_VIEWER.displayName);
  await expect(page.getByTestId("profile-photo-remove")).toHaveCount(0);

  await field.fill(NEW_NAME);
  await page.getByTestId("profile-name-save").click();

  await expectAccountMenuNamed(page, NEW_NAME);

  await page.reload();
  await expectAccountMenuNamed(page, NEW_NAME);
});

test("a picture the user uploads replaces their initials, and removing it falls back", async ({
  page,
  request,
}) => {
  await armSpace(request);
  await openProfile(page);

  const avatar = page.getByTestId("profile-avatar");
  await expect(avatar.locator('[data-slot="avatar-fallback"]')).toHaveText(
    "AL",
  );
  await expect(avatar.locator("img")).toHaveCount(0);

  await page.getByTestId("profile-photo-input").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  const image = avatar.locator("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\//);

  const remove = page.getByTestId("profile-photo-remove");
  await expect(remove).toBeVisible();
  await remove.click();

  await expect(avatar.locator("img")).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-fallback"]')).toHaveText(
    "AL",
  );
});
