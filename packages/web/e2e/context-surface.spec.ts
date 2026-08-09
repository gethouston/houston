import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  aboutMeRow,
  openAboutMe,
  openAdminSection,
} from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * The standing context every agent loads before it starts a turn — and the two
 * homes it now has, one per OWNER of the words.
 *
 * It used to be a single two-tab "Context" screen behind a quiet door in the
 * Inbox's masthead: find a door, then pick a tab, before reaching the one thing
 * you came for. Both the door and the tab strip are gone, and each half went to
 * whoever the words belong to:
 *
 *  - **About me** — what the agents know about the PERSON. It is nobody's admin
 *    territory and it is not a preference, so it is an UNGATED top-level row in
 *    the rail's lead run, owning the whole window (no back bar, nothing above
 *    it). It exists in every deployment, including a solo desktop install.
 *  - **Admin > Company context** — what the agents know about the COMPANY. It is
 *    shared by everyone in the space, so it is the space owner's: a section of
 *    the Admin dashboard, which is itself gated to a team space and therefore
 *    never appears on a personal/solo install.
 *
 * The underlying data did not move: each half still reads and writes its own
 * slot of the same blob (`WORKSPACE.md` / `USER.md` locally, the org+user blobs
 * in cloud) through `use-workspace-context`.
 */

/** Teams owner on a non-spaces host: the sole workspace is the org, so Admin
 *  (and with it Company context) is theirs. */
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

test("About me is a rail row of its own, owning the whole window", async ({
  page,
}) => {
  // No capabilities armed: a plain single-player install, which is exactly
  // where this half has to exist — it is the whole of the product's standing
  // context there.
  await seedEmptyContext(page);
  await page.goto("/");
  await expect(aboutMeRow(page)).toBeVisible();
  await openAboutMe(page);

  await expect(
    screen(page).getByText(
      "What every agent knows about you before it starts.",
    ),
  ).toBeVisible();
  // The PERSON's slot, not the company's: the empty state names who it is about.
  await expect(
    screen(page).getByText("Tell every agent about you"),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Write user context" }),
  ).toBeVisible();

  // Nothing sits above a top-level screen, so it offers no way back — a bar
  // naming the Inbox would be the old door leaking through.
  await expect(
    screen(page).getByRole("button", { name: "Inbox", exact: true }),
  ).toHaveCount(0);
});

test("Company context is a section of Admin, editing the workspace's half", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await seedEmptyContext(page);
  await page.goto("/");
  await openAdminSection(page, "Company context");

  // The WORKSPACE slot: the same editor, pointed at the shared half.
  await expect(
    screen(page).getByText("Tell every agent about this workspace"),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Write workspace context" }),
  ).toBeVisible();

  // And only that half. The person's context is not duplicated inside Admin —
  // it is theirs, not the admin's, which is the whole reason the two split.
  await expect(
    screen(page).getByText("Tell every agent about you"),
  ).toHaveCount(0);

  // It sits one level under the Admin index, so it DOES carry a back bar —
  // the mirror of About me's missing one.
  await expect(
    screen(page).getByRole("button", { name: "Admin", exact: true }),
  ).toBeVisible();
});
