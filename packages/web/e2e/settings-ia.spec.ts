import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import {
  aboutMeRow,
  adminRow,
  openAdmin,
  openSettings,
} from "./support/settings-nav";
import { navRow, screen } from "./support/team-nav";

/**
 * The rail's information architecture, and what Settings is left holding.
 *
 * Admin is a TOP-LEVEL screen in the rail's "Workspace" band, not a Settings
 * section: it is not a preference and it owns the whole window. Six things must
 * hold, and each of them broke a real user path when it didn't:
 *
 * 1. the rail carries exactly the top-level entries the IA names — the
 *    unlabelled lead run (Inbox, About me, Agent Store), "My accounts"
 *    (Integrations, AI Models) and "Workspace" (Admin, Skills) — with Settings
 *    and the help control in the footer;
 * 2. the two rows that band used to carry are GONE from the rail entirely.
 *    **Permissions** listed the space's agents to reach one's settings page,
 *    which every team's "Manage agents" section already does per team, in every
 *    deployment; **Time worked** is a lens inside Admin > Analytics. Both are
 *    asserted absent by their old names, so resurrecting either fails here;
 * 3. Settings holds ONLY settings: the general group everybody sees, plus
 *    Danger. The guided tour, the Context editors, Time worked, Admin and
 *    Permissions all left, and the "Help" / "Context" / "Support" / "Team"
 *    headings died with them;
 * 4. Admin opens from the rail in ONE click and shows NO back affordance at its
 *    top level — it has no level above it;
 * 5. the rail's Settings entry ALWAYS lands on the index, including from inside
 *    a section — otherwise it is a dead click, since the view is already
 *    `settings`;
 * 6. Settings is the app's ONE identity control. The rail's avatar menu (edit
 *    profile / account settings / send feedback / sign out) was a second door
 *    onto this page, so the index now opens on the signed-in person and carries
 *    the only Sign out in the product.
 *
 * The footer's help control is the seventh: "Guide me" and "Report a problem",
 * the two things a stuck user reaches for, behind one "?" beside the gear —
 * neither of them a destination, which is why neither is a rail row.
 */

/**
 * Teams owner on a gateway that meters running time, so the whole "Workspace"
 * band exists: Admin rides the org role, Skills rides space ownership.
 *
 * `computeUsage` is on deliberately even though nothing in this spec opens
 * Analytics: this is exactly the deployment that used to carry a Time worked
 * ROW, so it is the one that makes the row's absence below mean something.
 */
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

/** A rail row addressed the way a user reads it. The rows this IA DELETED have
 *  no anchor and no testid left to ask for, so their old label is the only
 *  honest handle for "it must not be back". */
function railButton(page: Page, name: string): Locator {
  return page
    .locator("[data-tour-target='sidebar']")
    .getByRole("button", { name, exact: true });
}

test("the sidebar carries only the IA's top-level entries, under their bands", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  // The lead run needs no band; the rest are named by one. About me sits in it
  // without a tour anchor, so it is addressed by name.
  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(navRow(page, "inbox")).toBeVisible();
  await expect(aboutMeRow(page)).toBeVisible();
  await expect(navRow(page, "agent-store")).toBeVisible();

  await expect(sidebar.getByText("My accounts")).toBeVisible();
  for (const id of ["integrations", "ai-hub"] as const) {
    await expect(navRow(page, id)).toBeVisible();
  }
  await expect(sidebar.getByText("Workspace", { exact: true })).toBeVisible();
  // The caller is the space owner AND the org owner, so the whole band is
  // theirs — and it is exactly two rows. Settings lives in the rail footer,
  // outside the band.
  await expect(adminRow(page)).toBeVisible();
  await expect(navRow(page, "skills")).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();

  // The rows this IA deleted, asserted by the names they used to wear. An owner
  // on a compute-metering gateway is the ONE caller who saw both, so if either
  // ever comes back it comes back here.
  await expect(railButton(page, "Permissions")).toHaveCount(0);
  await expect(railButton(page, "Time worked")).toHaveCount(0);
  // "Guide me" was never a destination: it lives behind the footer's help
  // control now, not in the rail's lead run.
  await expect(railButton(page, "Guide me")).toHaveCount(0);

  // The global mission board is gone: every board belongs to a team, and the
  // teams live in their own band below.
  await expect(page.locator('[data-tour-target="nav-dashboard"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-tour-target="nav-usage"]')).toHaveCount(0);
});

test("a plain member gets no Workspace band at all", async ({
  page,
  request,
}) => {
  // The band is two rows, and each is somebody's authority: Admin is the org's
  // (owner/admin), Skills is the space owner's. A plain member holds neither, so
  // the band empties and the library drops it heading and all — a heading may
  // never outlive the rows it names.
  //
  // NO `spaces` on purpose: on a C8 host the PERSONAL space has single-player
  // semantics, so `isSpaceOwner` hands Skills back to whoever is in it whatever
  // their org role, and the band would not be empty. This is the legacy Teams
  // shape, where the sole workspace really is the org.
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "user" },
  });
  await page.goto("/");

  // A positive signal FIRST, so the absences below cannot pass on an unpainted
  // rail: Integrations is unconditional for every role in every mode.
  await expect(navRow(page, "integrations")).toBeVisible();

  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(sidebar.getByText("Workspace", { exact: true })).toHaveCount(0);
  await expect(adminRow(page)).toHaveCount(0);
  await expect(navRow(page, "skills")).toHaveCount(0);
  // Ungated rows are untouched by the band's collapse: About me is everyone's
  // standing context, and Settings is everyone's chrome.
  await expect(aboutMeRow(page)).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();
});

test("Settings holds only settings, under one heading", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");
  await openSettings(page);

  // Asserted on the group headings themselves (`SettingsCard`'s h2), not on
  // page text: every top-level screen stays MOUNTED behind the open one, so a
  // bare text query would also see another screen's copy.
  const main = page.locator('[data-tour-target="main"]');
  const group = (name: string) =>
    main.getByRole("heading", { level: 2, name, exact: true });
  await expect(group("General")).toBeVisible();
  // The five headings that named things which are no longer settings. Each died
  // with its rows: the tour is armed from the footer's help control, the
  // person's context editor is the About me rail row and the company's is a
  // section of Admin, Time worked is a lens inside Admin > Analytics, Admin
  // itself is a rail screen, and the help-shaped rows merged into General rather
  // than keeping a group of their own.
  for (const heading of ["Help", "Context", "Support", "Workspace", "Team"]) {
    await expect(group(heading)).toHaveCount(0);
  }
  // The moved rows themselves are gone from the index, testid and all — even
  // for an owner, who is exactly who used to see the Team group.
  await expect(page.locator('[data-testid^="settings-row-"]')).toHaveCount(0);
  await expect(main.getByText("Your context")).toHaveCount(0);
  await expect(main.getByText("Workspace context")).toHaveCount(0);
  // The help-shaped rows survived the fold: they sit in General now.
  await expect(main.getByText("Keyboard shortcuts")).toBeVisible();
  await expect(main.getByText("Report bug")).toBeVisible();

  // This server bakes no identity key, so there is no session and therefore no
  // person to name. The header draws nothing rather than an empty face — the
  // same condition the rail's avatar menu used before it was removed.
  await expect(page.getByTestId("settings-identity")).toHaveCount(0);
});

test.describe("Settings is the app's one identity control", () => {
  // The header needs a real session, which the default server cannot mint: it
  // bakes no Firebase key. Same server and sign-in the profile spec uses.
  test.use({ baseURL: AUTH_WEB_URL });

  test("the index opens on the signed-in person, with the only way out", async ({
    page,
    request,
  }) => {
    await armOwner(request);
    await signInAsViewer(page);
    await openSettings(page);

    const identity = page.getByTestId("settings-identity");
    await expect(
      identity.getByText(E2E_VIEWER.displayName, { exact: true }),
    ).toBeVisible();
    await expect(
      identity.getByText(E2E_VIEWER.email, { exact: true }),
    ).toBeVisible();
    await expect(
      identity.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();

    // And it is the ONLY one: the rail no longer carries a face of its own, so
    // there is exactly one place in the product that says who you are.
    await expect(
      page
        .locator("[data-tour-target='sidebar']")
        .getByText(E2E_VIEWER.displayName),
    ).toHaveCount(0);
  });
});

test("Admin opens from the rail with no back bar above it", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  // A top-level screen owns the whole window, so its top level offers no way
  // "back" — a bar naming Settings would be the old two-step IA leaking through.
  // Scoped to the screen ON THE GLASS: every top-level view is kept alive, so an
  // unscoped lookup could read another screen's own back bar.
  await openAdmin(page);
  await expect(
    screen(page).getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
});

test("the footer's help control offers exactly Guide me and Report a problem", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  // One small "?" beside the gear, named for what it is rather than for either
  // of the two things behind it.
  const help = page
    .locator("[data-tour-target='sidebar']")
    .getByRole("button", { name: "Help", exact: true });
  await expect(help).toBeVisible();
  await help.click();

  // Exactly two items, in this order: being walked through the app, and telling
  // us it went wrong. Anything else here would be a settings row in disguise.
  await expect(page.getByRole("menuitem")).toHaveText([
    "Guide me",
    "Report a problem",
  ]);

  // "Report a problem" does not duplicate the bug-report surface — it opens the
  // ONE that already exists, on its Settings section.
  await page.getByRole("menuitem", { name: "Report a problem" }).click();
  await expect(
    screen(page).getByRole("heading", { level: 2, name: "Report bug" }),
  ).toBeVisible();
  // One level under the Settings index, so it carries that index's back bar.
  await expect(
    screen(page).getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
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

  // The view is ALREADY "settings", so this only works because opening Settings
  // clears the open section too — otherwise the click does nothing.
  await openSettings(page);
  await expect(sectionHeading).toHaveCount(0);
});
