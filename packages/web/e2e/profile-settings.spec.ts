import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

/**
 * A user names themselves, and Houston believes them everywhere.
 *
 * Settings > Profile writes the caller's own display name and picture through
 * the gateway's `PUT /v1/me/profile`. The point of the feature is NOT the form:
 * it is that the saved identity is the one every multiplayer surface renders,
 * so this spec proves the write reaches the host and then lands on a surface
 * that is not the editor itself.
 *
 * WHY THIS SPEC SIGNS IN. `useMyEditableProfile` is gated on
 * `isIdentityConfigured() && a live session`, and the self-face it repaints
 * (`useMyProfile` -> `GET /v1/org/profiles` for `useSession().uid`) needs a real
 * uid. The default e2e server bakes no Firebase key, so the section cannot even
 * render there. Like chat-senders.spec.ts, this runs on the identity-ON server
 * and signs in as {@link E2E_VIEWER}.
 *
 * The fake host models the whole contract (`routes-me.ts`): a `PUT` stores the
 * override, resolves the effective value, and REFLECTS it onto the armed org
 * roster, so `GET /v1/org/people` and `GET /v1/org/profiles` immediately serve
 * the new name/photo — exactly what the cloud gateway does, and what makes the
 * sidebar face repaint without a reload.
 */

test.use({ baseURL: AUTH_WEB_URL });

/** The signed-in viewer's roster row. It carries the display name their Google
 *  account gave them and NO picture, so the fake host captures that name as the
 *  identity-provider fallback and the avatar starts on its initials. */
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

/** The name the viewer gives themselves. Deliberately unlike "Ada Lovelace" so
 *  no assertion can pass on the seeded value. */
const NEW_NAME = "Ada Astra";

/** A real 1x1 opaque PNG: the smallest thing the browser can actually decode,
 *  which is what the canvas downscale needs (a stub buffer would not decode). */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Put the deployment into multiplayer and arm the co-member directory the
 *  self-face and the @mention roster both read. */
async function armSpace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [SELF, BOB] },
  });
}

/** Sign in, then walk the real sidebar into Settings > Profile. */
async function openProfileSettings(page: Page): Promise<void> {
  await signInAsViewer(page);
  await page.locator('[data-tour-target="nav-settings"]').click();
  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByTestId("profile-name-input")).toBeVisible();
}

/** The sidebar user row: a self-face OUTSIDE the editor, painted from the org
 *  profile the save reflected into. */
const sidebarName = (page: Page) =>
  page.getByRole("button", { name: NEW_NAME });

test("a display name the user picks becomes the name Houston shows them", async ({
  page,
  request,
}) => {
  await armSpace(request);
  await openProfileSettings(page);

  // The field opens on the EFFECTIVE name, inherited from the Google account:
  // nothing is user-set yet, so there is nothing to remove either.
  const field = page.getByTestId("profile-name-input");
  await expect(field).toHaveValue(E2E_VIEWER.displayName);
  await expect(page.getByTestId("profile-photo-remove")).toHaveCount(0);

  await field.fill(NEW_NAME);
  await page.getByTestId("profile-name-save").click();

  // The save lands on a surface that is NOT the form: the sidebar user row is
  // painted by `useMyProfile` -> `GET /v1/org/profiles`, which only knows the
  // new name because the write reached the host and the mutation invalidated
  // the profile caches.
  await expect(sidebarName(page)).toBeVisible();

  // A full reload re-reads everything from the host, so this proves the name
  // was persisted rather than held in the client cache.
  await page.reload();
  await expect(sidebarName(page)).toBeVisible();
});

test("a picture the user uploads replaces their initials, and removing it falls back", async ({
  page,
  request,
}) => {
  await armSpace(request);
  await openProfileSettings(page);

  // No picture anywhere yet: the preview is initials, not an image.
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

  // The browser squared + shrank it into a data URI before it ever hit the
  // wire, and the gateway now serves it back as the effective picture.
  const image = avatar.locator("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\//);

  // Because the picture is now the user's OWN, the clear-it-out affordance
  // appears. Removing sends `photoUrl: null`, which falls back to the Google
  // photo — here, none — so the initials come back.
  const remove = page.getByTestId("profile-photo-remove");
  await expect(remove).toBeVisible();
  await remove.click();

  await expect(avatar.locator("img")).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-fallback"]')).toHaveText(
    "AL",
  );
});
