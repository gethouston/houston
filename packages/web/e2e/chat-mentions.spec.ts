import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

/**
 * HOU-944 — @mentions of teammates in a chat, end to end.
 *
 * Three things have to be true for the feature to exist for a user:
 *   1. the composer offers the space's teammates behind "@" — by keyboard AND
 *      by click — and the sent message renders the pick as a chip;
 *   2. a RELOADED transcript chips the same people: a user turn from its own
 *      recorded `mentions[]`, an assistant turn from plain "@Name" prose matched
 *      against the space roster (a hand-rolled rehype pass inside Streamdown's
 *      plugin chain — the riskiest path in the feature), with a mention of the
 *      VIEWER emphasized;
 *   3. single player never fetches a roster, so "@" is just a character.
 *
 * The roster is armed on the fake host (`/__test__/org` → `GET /v1/org/people`)
 * next to multiplayer capabilities — the same wire shape the cloud gateway
 * serves. The seeded transcript (`/__test__/chat-history`) is the only way to
 * reach a reloaded shared conversation locally.
 *
 * WHY THIS SPEC SIGNS IN. The roster read is gated on
 * `isIdentityConfigured() && isMultiplayer(capabilities)`, and "is this mention
 * ME?" keys off `useSession().uid`. The default e2e server bakes no Firebase key,
 * so there the feature can't exist at all: no roster fetch, no popover, no
 * self-chip. This spec therefore runs on the identity-ON server and signs in as
 * {@link E2E_VIEWER} (see support/identity.ts), which makes the viewer's
 * identity — the thing half of this feature is about — controllable.
 */

test.use({ baseURL: AUTH_WEB_URL });

/** The spec's OWN mission + its conversation. Created here rather than reusing a
 *  seeded card (see chat-senders.spec.ts): a fresh activity carries no
 *  server-stamped contributors, so it stays visible under the board's default
 *  person scope in multiplayer. */
const MISSION_ID = "act-mentions";
const MISSION_TITLE = "Quarterly close checklist";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

/** The armed space: the signed-in viewer, one teammate, and a member with NO
 *  display name — the client must never offer an id as a mentionable person. */
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
const GHOST = { userId: "u-ghost", email: "ghost@acme.test", role: "user" };

/** Put the deployment into multiplayer (what the real gateway advertises). */
async function armMultiplayer(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

/** Arm the co-member directory `GET /v1/org/people` is built from. */
async function armRoster(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [GHOST, SELF, BOB] },
  });
}

/** Create the mission whose card opens this conversation. */
async function seedMission(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: MISSION_TITLE, status: "needs_you" },
  });
}

/** The rendered message rows the USER wrote — each carries its stable
 *  conversation key, and `is-user` is the bubble's own marker, so an assertion
 *  can never be satisfied by the agent echoing the same words back. */
const userRows = (page: Page) =>
  page.locator("[data-conversation-message-key].is-user");
/** …and only the rows the agent wrote. */
const agentRows = (page: Page) =>
  page.locator("[data-conversation-message-key]:not(.is-user)");
/** The composer of an already-open conversation. */
const composerOf = (page: Page) => page.getByPlaceholder("Send a follow-up...");
const popover = (page: Page) => page.locator("[data-mention-popover]");
const option = (page: Page, userId: string) =>
  page.locator(`[data-mention-option="${userId}"]`);

/** Open the spec's mission on the signed-in shell. */
async function openMission(page: Page): Promise<void> {
  await page.getByText(MISSION_TITLE).click();
  await expect(composerOf(page)).toBeVisible();
}

test("the composer offers teammates behind @ and the sent message chips the pick", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMission(request);
  await signInAsViewer(page);
  await openMission(page);

  const composer = composerOf(page);
  await composer.click();

  // --- input path 1: pick with the mouse -----------------------------------
  await composer.pressSequentially("Ping @Bo");
  await expect(popover(page)).toBeVisible();
  // The list keeps the semantics a keyboard/AT user needs.
  const listbox = popover(page).locator('[role="listbox"]');
  await expect(listbox).toBeVisible();
  const bob = option(page, "u-bob");
  await expect(bob).toHaveAttribute("role", "option");

  // Focus never leaves the textarea, so the TEXTAREA is the combobox: without
  // this wiring a screen-reader user is never told the list opened, nor which
  // teammate they are on.
  await expect(composer).toHaveAttribute("role", "combobox");
  await expect(composer).toHaveAttribute("aria-expanded", "true");
  const listboxId = await listbox.getAttribute("id");
  expect(listboxId).toBeTruthy();
  await expect(composer).toHaveAttribute("aria-controls", String(listboxId));
  const activeId = await composer.getAttribute("aria-activedescendant");
  await expect(bob).toHaveAttribute("id", String(activeId));
  // The row reads as a person: their face (initials here) beside their name.
  await expect(bob).toContainText("Bob Stone");
  await expect(bob.locator('[data-slot="avatar"]')).toBeVisible();
  await expect(bob).toContainText("BS");

  await bob.click();
  // Accepting writes PLAIN TEXT: the composer stays a <textarea>.
  await expect(composer).toHaveValue("Ping @Bob Stone ");
  await expect(popover(page)).toHaveCount(0);
  // …and the combobox wiring reverts cleanly: a plain textarea again.
  await expect(composer).not.toHaveAttribute("role", "combobox");
  await expect(composer).not.toHaveAttribute("aria-expanded", "true");
  await expect(composer).not.toHaveAttribute("aria-activedescendant", /.*/);

  // --- input path 2: pick with the keyboard --------------------------------
  await composer.fill("");
  await composer.pressSequentially("Please loop in @");
  await expect(popover(page)).toBeVisible();
  // You never @mention yourself, and a member with no display name is never
  // offered ("@u-ghost" is nonsense to a non-technical reader) — so the bare
  // "@" query offers exactly one person out of the three-member space.
  await expect(option(page, E2E_VIEWER.uid)).toHaveCount(0);
  await expect(option(page, "u-ghost")).toHaveCount(0);
  await expect(popover(page).locator('[role="option"]')).toHaveCount(1);

  await page.keyboard.press("ArrowDown");
  await expect(bob).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("Please loop in @Bob Stone ");
  await expect(popover(page)).toHaveCount(0);

  // --- the sent bubble chips the mention -----------------------------------
  await composer.press("Enter");
  const SENT = "Please loop in @Bob Stone";
  const sent = userRows(page).filter({ hasText: SENT });
  await expect(sent).toBeVisible();
  const chip = sent.locator("[data-mention-chip]");
  await expect(chip).toHaveText("@Bob Stone");
  // Bob is not the viewer, so no emphasis.
  await expect(chip).not.toHaveAttribute("data-mention-self", "");

  // The mention travelled over the WIRE, not just into the optimistic bubble:
  // after a reload the bubble is rebuilt from the host's persisted history, so
  // the chip only survives if the send carried its `mentions[]` sidecar.
  await page.reload();
  await openMission(page);
  await expect(
    userRows(page).filter({ hasText: SENT }).locator("[data-mention-chip]"),
  ).toHaveText("@Bob Stone");
});

test("a reloaded transcript chips mentions in a user turn and in assistant prose", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await armRoster(request);
  await seedMission(request);
  // The user turn NAMES two people but RECORDED only Bob: a user bubble chips
  // its own `mentions[]`, never the roster, so "@Ada Lovelace" stays prose.
  const ASKED = "Can @Bob Stone close it with @Ada Lovelace?";
  // The assistant turn records nothing — its "@Name" runs are matched against
  // the space roster by the rehype pass, and the viewer's own is emphasized.
  const REPLIED =
    "On it. @Ada Lovelace signed off and @Bob Stone has the file.";
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        {
          role: "user",
          content: ASKED,
          ts: 1,
          mentions: [{ userId: BOB.userId, name: BOB.displayName }],
        },
        { role: "assistant", content: REPLIED, ts: 2 },
      ],
    },
  });
  await signInAsViewer(page);
  await openMission(page);

  const asked = userRows(page).filter({ hasText: "Can @Bob Stone close it" });
  await expect(asked).toBeVisible();
  // Exactly one chip: the recorded mention. The unrecorded name stays prose.
  await expect(asked.locator("[data-mention-chip]")).toHaveText(["@Bob Stone"]);

  // The riskiest path: assistant PROSE, chipped from the roster alone.
  const replied = agentRows(page).filter({ hasText: "signed off" });
  await expect(replied).toBeVisible();
  const chips = replied.locator("[data-mention-chip]");
  await expect(chips).toHaveText(["@Ada Lovelace", "@Bob Stone"]);
  // "The agent is asking ME": the viewer's own mention carries the emphasis.
  await expect(chips.first()).toHaveAttribute("data-mention-self", "");
  await expect(chips.last()).not.toHaveAttribute("data-mention-self", "");
  await expect(replied.locator("[data-mention-self]")).toHaveCount(1);
});

test("single player never offers a mention list — @ is just a character", async ({
  page,
  request,
}) => {
  // No capabilities arming: the roster read is multiplayer-gated, so the
  // directory is never fetched and no popover can exist. The roster IS armed on
  // the host, so a fetch would succeed — proving the gate, not an empty space.
  await armRoster(request);
  await seedMission(request);
  const rosterReads: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/v1/org/people")) rosterReads.push(req.url());
  });
  await signInAsViewer(page);
  await openMission(page);

  const composer = composerOf(page);
  await composer.click();
  await composer.pressSequentially("Ping @Bo");

  await expect(composer).toHaveValue("Ping @Bo");
  await expect(popover(page)).toHaveCount(0);
  await expect(option(page, "u-bob")).toHaveCount(0);
  expect(rosterReads).toEqual([]);
});
