import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAboutMe, openAdminSection } from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * The standing context every agent loads before it starts a turn — and the two
 * homes it has, one per OWNER of the words.
 *
 *  - **About me** — what the agents know about the PERSON. They set it once
 *    about themselves, so it is a SECTION of Settings, beside their name and
 *    their language. It is ungated: it exists in every deployment, including a
 *    solo desktop install.
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

test("About me is a Settings section, drilled from the index", async ({
  page,
}) => {
  // No capabilities armed: a plain single-player install, which is exactly
  // where this half has to exist — it is the whole of the product's standing
  // context there.
  await seedEmptyContext(page);
  await page.goto("/");
  await openAboutMe(page);

  await expect(
    screen(page).getByText(
      "What every agent knows about you before it starts.",
    ),
  ).toBeVisible();
  // No invite empty state on a standing-context page: the editor is already
  // open, and the greyed suggestion — which names the PERSON, not the
  // company — is the invitation.
  await expect(screen(page).getByText(/I'm Juan/)).toBeVisible();

  // A section sits one level below the index, so it wears that level's back
  // bar and returns there.
  const back = screen(page).getByRole("button", { name: "Settings" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(
    screen(page).getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});

test("Company context is a section of Admin, editing the workspace's half", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await seedEmptyContext(page);
  await page.goto("/");
  await openAdminSection(page, "Company context");

  // The WORKSPACE slot: the editor is already open (no invite empty state),
  // and its greyed suggestion is a short 3-part example RENDERED as real
  // headings (the overlay is aria-hidden decoration, so it is asserted as
  // text, never by role): the words appear, the "##" syntax never does.
  const editor = screen(page).getByRole("textbox");
  await expect(screen(page).getByText("Who we are")).toBeVisible();
  await expect(screen(page).getByText("How we communicate")).toBeVisible();
  await expect(screen(page).getByText("## Who we are")).toHaveCount(0);

  // And only that half. The person's context is not duplicated inside Admin —
  // it is theirs, not the admin's, which is the whole reason the two split.
  await expect(editor).toHaveCount(1);
  await expect(screen(page).getByText(/I'm Juan/)).toHaveCount(0);

  // The identity lozenge ("Admin") stands for this very section, so it is
  // the current one — and the section titles ITSELF: a level-2 hero naming
  // Company context and what belongs in it, since the lozenge doesn't.
  await expect(
    screen(page).getByRole("button", { name: "Admin", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    screen(page).getByRole("heading", { name: "Company context", level: 2 }),
  ).toBeVisible();
  await expect(
    screen(page).getByText(
      "What all your agents know on every task and routine they run.",
    ),
  ).toBeVisible();
});
