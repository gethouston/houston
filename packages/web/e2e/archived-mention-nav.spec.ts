import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";
import { rail, screen } from "./support/team-nav";

/**
 * An @mention on an ARCHIVED mission, opened from the Mentions inbox.
 *
 * A mission board is two surfaces that SWAP — the active board and the archive
 * — and each holds half the workspace: the active one filters
 * `status === "archived"` out, the archive keeps only those. A published
 * navigation names a mission id and nothing else, so if the wrong surface is
 * forced on screen the target lands on a board whose items do not contain it:
 * the panel opens on a null session, the transcript is blank and the composer
 * silently swallows every send. That is what an archived @mention used to do.
 *
 * The surface is decided from the RAW sweep rows (`lib/board-surface-nav.ts`),
 * above both boards, so the archive is swapped in and claims the target itself.
 *
 * Identity-ON, exactly like `mentions-inbox.spec.ts`: "is this mention ME?"
 * keys off `useSession().uid`, so the default server cannot express the feature
 * at all. The mention aggregate is server-stamped in the real product, so it is
 * seeded straight onto the activity here — the same wire shape the host serves.
 */

test.use({ baseURL: AUTH_WEB_URL });

/** The archived mission a teammate typed my name in. */
const MISSION_ID = "act-archived-mention";
const MISSION_TITLE = "Close the 2023 books";
const CONVERSATION_ID = `activity-${MISSION_ID}`;
/** Its transcript, so "the chat opened" is provable by what it SAYS. */
const ASKED = "Reconcile December before we file";
const REPLIED = "December reconciled, nothing outstanding.";
const FOLLOW_UP = "Send it to the accountant too";

const SELF = {
  userId: E2E_VIEWER.uid,
  email: E2E_VIEWER.email,
  role: "owner",
  displayName: E2E_VIEWER.displayName,
  photoUrl: E2E_VIEWER.photoUrl,
};
const BOB = {
  userId: "u-bob",
  email: "bob@acme.test",
  role: "user",
  displayName: "Bob Stone",
};

/** Put the deployment into multiplayer (what the real gateway advertises). */
async function armMultiplayer(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

/** Arm the roster the inbox resolves the mentioner's face + name from. */
async function armRoster(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [SELF, BOB] },
  });
}

/**
 * The mission itself: ARCHIVED, and carrying a mention of me. Both facts
 * matter — the mention is what puts a row in the inbox, the archived status is
 * what makes the row's destination the archive rather than the board.
 */
async function seedArchivedMention(request: APIRequestContext): Promise<void> {
  const at = new Date(Date.now() - 5 * 60_000).toISOString();
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: MISSION_ID,
      title: MISSION_TITLE,
      status: "archived",
      contributors: [{ user_id: BOB.userId, name: BOB.displayName }],
      mentioned: [{ user_id: E2E_VIEWER.uid, at, by: BOB.userId }],
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: ASKED, ts: 1 },
        { role: "assistant", content: REPLIED, ts: 2 },
      ],
    },
  });
}

/** Mission Control, the top-level view that owns the inbox. */
async function openMissionControl(page: Page): Promise<void> {
  await page.locator("[data-tour-target='nav-dashboard']").click();
}

/** The Mentions mode control, and the inbox rows behind it. */
const mentionsControl = (page: Page) =>
  page.getByRole("button", { name: /mention/i });
const inboxRows = (page: Page) =>
  page.getByRole("button").filter({ hasText: "mentioned you" });

/** Open the inbox and click the one row in it. */
async function openTheMentionRow(page: Page): Promise<void> {
  await openMissionControl(page);
  await expect(mentionsControl(page)).toHaveAccessibleName(/1 unread mention/);
  await mentionsControl(page).click();
  await expect(inboxRows(page)).toHaveCount(1);
  await inboxRows(page).first().click();
}

test("an @mention on an archived mission opens it ON THE ARCHIVE, with its history", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedArchivedMention(request);
  await signInAsViewer(page);
  await openTheMentionRow(page);

  // The nav landed on the agent's TEAM board (the destination every mention row
  // has since the agent tab shell went away) — and on its ARCHIVE, which is the
  // only surface that can render a mission with this status. "Back to missions"
  // is the archive's own exit control, so its presence IS the surface.
  await expect(
    rail(page)
      .locator("[data-sidebar-section-row]")
      .filter({ hasText: "Mission Control" })
      .first(),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    screen(page).getByRole("button", { name: "Back to missions" }),
  ).toBeVisible();
  await expect(screen(page).getByText(MISSION_TITLE).first()).toBeVisible();

  // The mission is SELECTED, not merely listed: its transcript is on screen.
  // A target consumed by the wrong surface opens a panel with no session at
  // all, which is exactly a chat with no history and a dead composer.
  // Page-scoped, not `screen`-scoped: the chat portals into the ONE shared
  // shell detail panel, which lives outside every kept-alive screen.
  await expect(page.getByText(REPLIED)).toBeVisible();
  await expect(page.getByText(ASKED)).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

test("the archived mission's composer still sends, and hands back to the active board", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedArchivedMention(request);
  await signInAsViewer(page);
  await openTheMentionRow(page);

  // Sending in an archived chat re-activates the mission, so the surface it
  // belongs to changes under the user and the handoff has to carry them with
  // it — landing back on the ACTIVE board with the conversation still open.
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  await composer.fill(FOLLOW_UP);
  await composer.press("Enter");

  await expect(
    screen(page).getByRole("button", { name: "Archived", exact: true }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Back to missions" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});
