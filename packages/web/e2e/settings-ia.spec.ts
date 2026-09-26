import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import {
  aboutMeRow,
  adminHeading,
  adminRow,
  assistantRow,
  openAdmin,
  openSettings,
  skillsRow,
} from "./support/settings-nav";
import { navRow, screen } from "./support/team-nav";

/**
 * The rail's information architecture, and what Settings is left holding.
 *
 * Six things must hold, and each of them broke a real user path when it
 * didn't:
 *
 * 1. the rail carries exactly the top-level entries the IA names — ONE
 *    unlabelled run (Assistant, AI Models, Integrations, Skills) over "Your
 *    AI Employees" — with Academy, Admin (behind the org gate) and Settings in
 *    the footer, and no help control;
 * 2. two destinations live BEHIND other screens rather than in the rail: agent
 *    policy is reached through each employee's own screen, and **Time worked**
 *    is a section of Admin. Each is asserted absent from the rail by name, so
 *    a top-level row for either fails here;
 * 3. Settings holds the person's standing setup: the general group everybody
 *    sees, plus Danger. The Context editors live in their own surfaces, so
 *    Settings carries no "Help" / "Context" / "Support" / "Workspace" /
 *    "Team" heading;
 * 4. Admin is a top-level screen opened from its rail row, so its header strip
 *    carries no way back;
 * 5. the rail's Settings entry ALWAYS lands on the index, including from inside
 *    a section — otherwise it is a dead click, since the view is already
 *    `settings`;
 * 6. Settings is the app's ONE identity control: the index opens on the
 *    signed-in person and carries the only Sign out in the product, so the rail
 *    keeps no avatar menu (edit profile / account settings / send feedback /
 *    sign out) as a second door onto the same page.
 */

/**
 * Teams owner on a gateway that meters running time, so the Skills row exists
 * in the rail (it rides space ownership) and the Admin dashboard is this
 * caller's to open.
 *
 * `computeUsage` is on deliberately even though nothing in this spec opens
 * Time worked: this deployment advertises the compute capability, so it is the
 * one that makes the standalone row's absence below mean something.
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

test("the sidebar carries only the IA's top-level entries", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  // ONE unlabelled run, which needs no heading. The Assistant sits in it
  // without a tour anchor, so it is addressed by name.
  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(assistantRow(page)).toBeVisible();
  for (const id of ["ai-hub", "integrations"] as const) {
    await expect(navRow(page, id)).toBeVisible();
  }
  // Skills closes the run, right after Integrations. Anchorless like the
  // Assistant, so it is addressed by its own test id.
  await expect(skillsRow(page)).toBeVisible();
  // "Your AI Employees" is the rail's ONE band: nothing is labelled above it, even
  // for the space owner, who holds one more destination than a member.
  await expect(sidebar.getByText("Workspace", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("Your AI Employees")).toBeVisible();
  // The footer cluster: Academy, Admin, then Settings. The Academy carries
  // no tour anchor, so its name is the handle.
  await expect(railButton(page, "Academy")).toBeVisible();
  await expect(adminRow(page)).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();

  // The rows this IA deleted, asserted by the names they used to wear. An owner
  // on a compute-metering gateway is the ONE caller who saw both, so if
  // either ever comes back it comes back here.
  await expect(railButton(page, "Permissions")).toHaveCount(0);
  await expect(railButton(page, "Time worked")).toHaveCount(0);
  // About me is a Settings section and the Inbox screen is gone, so neither
  // may hold a rail slot as well.
  await expect(railButton(page, "About me")).toHaveCount(0);
  await expect(railButton(page, "Inbox")).toHaveCount(0);

  // The global mission board is gone: every board belongs to a team, and the
  // teams live in their own band below.
  await expect(page.locator('[data-tour-target="nav-dashboard"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-tour-target="nav-usage"]')).toHaveCount(0);
});

test("a plain member gets no Skills row in the rail", async ({
  page,
  request,
}) => {
  // The shared library is the space OWNER's authority: editing a skill edits
  // every agent in the space at once. A plain member does not hold it, so the
  // rail's lead run ends at Integrations.
  //
  // NO `spaces` on purpose: on a C8 host the PERSONAL space has single-player
  // semantics, so `isSpaceOwner` hands Skills back to whoever is in it whatever
  // their org role. This is the legacy Teams shape, where the sole workspace
  // really is the org.
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "user" },
  });
  await page.goto("/");

  // A positive signal FIRST, so the absences below cannot pass on an unpainted
  // rail: Integrations is unconditional for every role in every mode.
  await expect(navRow(page, "integrations")).toBeVisible();

  // Ungated rows are untouched: the Academy is everyone's, Settings is
  // everyone's chrome, and the Assistant rides discovery rather than a role,
  // so a plain member keeps it. Admin rides the org gate, so it is absent.
  await expect(assistantRow(page)).toBeVisible();
  await expect(railButton(page, "Academy")).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();
  await expect(adminRow(page)).toHaveCount(0);

  // The Skills row is simply absent — the gate, not an unpainted rail, which
  // is what the positive signals above already ruled out. The Integrations
  // screen still paints its catalog: that one is everyone's.
  await expect(skillsRow(page)).toHaveCount(0);
  await navRow(page, "integrations").click();
  await expect(
    screen(page).locator("[data-integrations-section='catalog']"),
  ).toBeVisible();

  // Settings keeps no door to it either: the library left the index with the
  // section, so its old row must not come back.
  await openSettings(page);
  await expect(aboutMeRow(page)).toBeVisible();
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

  // Asserted on the group headings themselves (`SettingsCard`'s h2), not on
  // page text: every top-level screen stays MOUNTED behind the open one, so a
  // bare text query would also see another screen's copy.
  const main = page.locator('[data-tour-target="main"]');
  const group = (name: string) =>
    main.getByRole("heading", { level: 2, name, exact: true });
  await expect(group("General")).toBeVisible();
  // The five headings that named things which are not settings. Each died with
  // its rows: what the agents know about the COMPANY and Time worked are
  // sections of Admin, and the help-shaped rows sit in General rather than
  // keeping a group of their own.
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
  // About me is one of them: a standing preference about the person, so the
  // index lists it beside their name and their language.
  await expect(aboutMeRow(page)).toBeVisible();

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

test("Admin opens from its rail row without a back control", async ({
  page,
  request,
}) => {
  await armOwner(request);
  await page.goto("/");

  // A top-level screen, so its header strip leads with the identity lozenge
  // and no way back. Scoped to the screen ON THE GLASS: every top-level view
  // is kept alive, so an unscoped lookup could read another screen's control.
  await openAdmin(page);
  await expect(adminHeading(page)).toBeVisible();
  await expect(
    screen(page)
      .getByTestId("page-header")
      .getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
});

test("the footer has no help control", async ({ page, request }) => {
  await armOwner(request);
  await page.goto("/");
  await expect(railButton(page, "Academy")).toBeVisible();
  // Report bug lives in Settings; the footer holds destinations only.
  await expect(railButton(page, "Help")).toHaveCount(0);
  await expect(railButton(page, "Report a problem")).toHaveCount(0);
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
