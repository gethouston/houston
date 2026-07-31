import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

/**
 * HOU-945 — relevance-scoped notifications, the surface half: Mission Control's
 * Mentions inbox.
 *
 * With many agents running in parallel a user must only be signalled about work
 * that is theirs, and an @mention is the strongest such claim. The inbox is the
 * place those claims collect: one row per mission where a teammate typed your
 * name, newest first, each row navigating to that mission's chat.
 *
 * Everything here is multiplayer-gated AND identity-gated: "is this mention ME?"
 * keys off `useSession().uid`, so the default (identity-OFF) e2e server can't
 * express the feature at all. This spec therefore runs on the identity-ON server
 * and signs in as {@link E2E_VIEWER} (`u-self`), exactly like chat-mentions.spec.
 *
 * The mention AGGREGATE (`Activity.mentioned`) is server-stamped by the host from
 * a gateway-verified acting identity, so it cannot be produced by a local turn.
 * It is seeded straight onto the activity here, which is the same wire shape the
 * real host serves from `.houston/activity`.
 */

test.use({ baseURL: AUTH_WEB_URL });

/** The spec's OWN mission. A fresh activity carries no server-stamped
 *  contributors, so nothing but what this spec seeds decides its relevance. */
const MISSION_ID = "act-mention-inbox";
const MISSION_TITLE = "Renew the vendor contracts";
/** A second mission that mentions somebody ELSE: it must never reach my inbox. */
const OTHER_ID = "act-not-mine";
const OTHER_TITLE = "Rewrite the pricing page";
/** A third mission: MINE, moved since I last looked, naming nobody at all. It
 *  is the ambient-movement half of the "unread" signal, which the Mentions pill
 *  must never fold into its count. */
const MOVED_ID = "act-moved-no-mention";
const MOVED_TITLE = "Reconcile the March invoices";

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

/** Arm the roster the inbox resolves mentioner faces + names from. */
async function armRoster(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [SELF, BOB] },
  });
}

/**
 * Seed the two missions. The first carries a `mentioned` entry naming the
 * viewer (stamped `by` Bob); the second names Bob instead, so the inbox has a
 * genuine chance to get it wrong.
 */
async function seedMissions(request: APIRequestContext): Promise<void> {
  const at = new Date(Date.now() - 5 * 60_000).toISOString();
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: MISSION_ID,
      title: MISSION_TITLE,
      status: "needs_you",
      contributors: [{ user_id: BOB.userId, name: BOB.displayName }],
      mentioned: [{ user_id: E2E_VIEWER.uid, at, by: BOB.userId }],
    },
  });
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: OTHER_ID,
      title: OTHER_TITLE,
      status: "running",
      mentioned: [{ user_id: BOB.userId, at, by: E2E_VIEWER.uid }],
    },
  });
}

/**
 * Seed a mission of MY OWN that carries no mention aggregate whatsoever. Paired
 * with {@link armAncientReadFloor} it is unread for me the AMBIENT way, which is
 * exactly the signal the Mentions pill must refuse to count.
 */
async function seedMovedMission(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: MOVED_ID,
      title: MOVED_TITLE,
      status: "running",
      created_by: E2E_VIEWER.uid,
      contributors: [{ user_id: E2E_VIEWER.uid, name: E2E_VIEWER.displayName }],
    },
  });
}

/**
 * Plant a read-cursor store floored at the epoch BEFORE the app boots.
 *
 * A store the app creates for itself is floored at "now" (so a fresh device does
 * not open on a backlog), while every fake-host activity is stamped at a fixed
 * 2024 instant. Out of the box nothing can therefore be ambient-unread, and the
 * distinction this spec turns on would be unobservable. An ancient floor is the
 * local equivalent of "these missions moved while I was away", and it is the
 * app's own persisted shape: `app/src/lib/read-cursors.ts` owns the key and the
 * blob, `read-cursors-parse.ts` the decoding.
 */
async function armAncientReadFloor(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, blob]) => window.localStorage.setItem(key, blob),
    [
      `houston.read-cursors.${E2E_VIEWER.uid}`,
      JSON.stringify({ since: 0, cursors: {} }),
    ] as const,
  );
}

/** Mission Control, the top-level cross-agent view that owns the inbox. */
async function openMissionControl(page: Page): Promise<void> {
  await page.locator("[data-tour-target='nav-dashboard']").click();
}

/** The Mentions mode control. Its accessible name carries the unread count
 *  once there is one, which is exactly what makes the badge assertable. */
const mentionsControl = (page: Page) =>
  page.getByRole("button", { name: /mention/i });

/** The inbox rows (each row is a real button, so keyboard users reach them). */
const inboxRows = (page: Page) =>
  page.getByRole("button").filter({ hasText: "mentioned you" });

/** A board card, addressed by the marker the board's own drag layer reads. */
const missionCard = (page: Page, id: string) =>
  page.locator(`[data-kanban-card='${id}']`);

/** The inbox row's quiet unread dot: a filled circle on the action token,
 *  deliberately NOT a count chip ("there is something new here", not "act now"). */
const rowUnreadDot = (row: Locator) => row.locator("span.bg-action");

test("the inbox lists a mission that mentions me, and only that one", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMissions(request);
  await signInAsViewer(page);
  await openMissionControl(page);

  // The control advertises the unread count in its accessible name, so the
  // quiet visual badge has a non-visual equivalent (and one assertion covers
  // both). One unread mention, not two: the Bob-only mission is not mine.
  const control = mentionsControl(page);
  await expect(control).toBeVisible();
  await expect(control).toHaveAccessibleName(/1 unread mention/);

  await control.click();

  const rows = inboxRows(page);
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await expect(row).toContainText(MISSION_TITLE);
  // Who pinged me, and where. Never a raw user id.
  await expect(row).toContainText("Bob Stone mentioned you");
  await expect(row).toContainText("Houston");
  await expect(row).not.toContainText(BOB.userId);
  // The mission that mentions somebody else never reaches my inbox.
  await expect(page.getByText(OTHER_TITLE)).toHaveCount(0);
});

test("the pill counts mentions only, never a mission that merely moved", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMissions(request);
  await seedMovedMission(request);
  await armAncientReadFloor(page);
  await signInAsViewer(page);
  await openMissionControl(page);

  // My own mission moved while I was away, so it IS unread for me — but nobody
  // typed my name in it. It is on the board, alongside the one that mentions me.
  await expect(missionCard(page, MOVED_ID)).toBeVisible();
  await expect(missionCard(page, MISSION_ID)).toBeVisible();

  // The pill makes a NARROWER claim than "unread": it says out loud that someone
  // typed my name, so it counts the one mission where somebody did. Anchored,
  // because the whole point of this test is the number itself.
  await expect(mentionsControl(page)).toHaveAccessibleName(
    /^1 unread mention$/,
  );

  // And the inbox never invents a row for a mission that only moved.
  await mentionsControl(page).click();
  await expect(inboxRows(page)).toHaveCount(1);
  await expect(page.getByText(MOVED_TITLE)).toHaveCount(0);
});

test("an unread mention row carries the quiet unread dot until it is opened", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMissions(request);
  await signInAsViewer(page);
  await openMissionControl(page);
  await mentionsControl(page).click();

  const row = inboxRows(page).first();
  await expect(row).toBeVisible();
  const dot = rowUnreadDot(row);
  await expect(dot).toHaveCount(1);
  const fill = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).not.toBe("rgba(0, 0, 0, 0)");
});

test("opening the mission clears its mention, and the read cursor survives a reload", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMissions(request);
  await signInAsViewer(page);
  await openMissionControl(page);

  await expect(mentionsControl(page)).toHaveAccessibleName(/1 unread mention/);

  await missionCard(page, MISSION_ID).click();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();

  // Reload rather than just closing the panel: it proves the READ CURSOR was
  // written and persisted, not merely that an open mission suppresses its own
  // signal. A cursor that did not survive would light the pill up again — which
  // is exactly what a per-device cursor must not do once read.
  await page.reload();
  await openMissionControl(page);
  // Anchored: at zero the pill carries no count at all, it is just "Mentions".
  await expect(mentionsControl(page)).toHaveAccessibleName("Mentions");

  await mentionsControl(page).click();
  const row = inboxRows(page).first();
  await expect(row).toBeVisible();
  await expect(rowUnreadDot(row)).toHaveCount(0);
});

test("opening a mention row navigates to that mission's chat", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMissions(request);
  await signInAsViewer(page);
  await openMissionControl(page);
  await mentionsControl(page).click();

  await inboxRows(page).first().click();

  // The same handoff a completion notification performs: the mission's agent
  // becomes current, its board is showing, and the mission's chat is open. The
  // composer of an already-open conversation is the proof (the inbox itself has
  // none), and Mission Control is gone from under us.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
  await expect(mentionsControl(page)).toHaveCount(0);
});

test("single player never sees the Mentions mode", async ({
  page,
  request,
}) => {
  // No capabilities armed: the fake host advertises a single-player deployment,
  // exactly like the desktop. Even with a mention aggregate on disk the mode is
  // unreachable, so desktop gains no new chrome whatsoever.
  await seedMissions(request);
  await signInAsViewer(page);
  await openMissionControl(page);

  await expect(page.getByText(MISSION_TITLE)).toBeVisible();
  await expect(mentionsControl(page)).toHaveCount(0);
});
