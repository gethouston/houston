import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

/**
 * HOU-943 + HOU-960 — a SHARED chat reads like a group chat.
 *
 *  - a TEAMMATE's turn mirrors to the LEFT: their face in a column beside the
 *    bubble, their name as the bubble's FIRST LINE, in their own stable tone;
 *  - the VIEWER's own turn keeps the right-aligned bubble with no face and no
 *    visible name (a group chat never writes your name on your own bubble);
 *  - the AGENT keeps its prose layout, its mark, and its name in its colour;
 *  - name + face print only on the FIRST message of a run from one sender.
 *
 * Single player is untouched: no names, no faces, no left bubbles.
 *
 * The shared shape can't be produced by a local turn (only the cloud gateway
 * stamps a message's `author`), so the transcript is armed on the fake host
 * (`/__test__/chat-history`) alongside multiplayer capabilities — the same
 * wire shape `GET /agents/:id/conversations/:id/history` serves in the cloud.
 * That makes this a real regression test for the whole pipeline: history →
 * `historyToFeed` → the SDK conversation VM → `ui/chat`'s sender presentation.
 *
 * WHY THIS SPEC SIGNS IN (HOU-960). "Is this bubble MINE?" keys off
 * `useSession().uid`; with no identity every row is treated as the viewer's own
 * and nothing mirrors. So the spec runs on the identity-ON server and signs in
 * as {@link E2E_VIEWER}, which is what makes the self/teammate split testable
 * at all.
 */

test.use({ baseURL: AUTH_WEB_URL });

/**
 * The spec's OWN mission + its conversation. Created here rather than reusing a
 * seeded card so the transcript is the only thing under test: a fresh activity
 * carries no server-stamped contributors, so nothing the fixtures stamp on the
 * seeded missions can leak into the sender rail.
 */
const MISSION_ID = "act-shared";
const MISSION_TITLE = "Q3 pipeline handover";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

/** Two teammates, neither of them the viewer. */
const ADA = { userId: "user_a", name: "Ada Lovelace" };
const BO = { userId: "user_b", name: "Bo Diaz" };
/** The viewer's own authored turn, stamped exactly as the gateway would. */
const SELF = { userId: E2E_VIEWER.uid, name: E2E_VIEWER.displayName };

const ASKED = "Rebuild the Q3 pipeline report";
/** Carries a bare URL: a link inside the recessed peer bubble has to be
 *  a visible link chip without hovering (HOU-1152: tint is the affordance). */
const PEER_LINK = "https://example.com/q3-pipeline";
const ADA_AGAIN = `And drop anything below ten thousand, see ${PEER_LINK}`;
const REPLIED = "Sixty-three open deals, cross-checked.";
const REPLIED_AGAIN = "The CRM export is attached.";
const FOLLOWED_UP = "Exclude the churned accounts";
const MINE = "Also flag the renewals";

/**
 * Arm the transcript. `solo` gives every user turn to the viewer, proving that
 * multiplayer alone does not make a viewer-and-agent conversation a group chat.
 *
 * Ada writes twice in a row on purpose: her second message is the run
 * continuation that must render bare.
 */
async function seedTranscript(
  request: APIRequestContext,
  presentation: "group" | "solo",
): Promise<void> {
  const author = (who: typeof ADA) => ({
    author: presentation === "solo" ? SELF : who,
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: ASKED, ts: 1, ...author(ADA) },
        { role: "user", content: ADA_AGAIN, ts: 2, ...author(ADA) },
        { role: "assistant", content: REPLIED, ts: 3 },
        { role: "assistant", content: REPLIED_AGAIN, ts: 4 },
        { role: "user", content: FOLLOWED_UP, ts: 5, ...author(BO) },
        { role: "user", content: MINE, ts: 6, ...author(SELF) },
      ],
    },
  });
}

/** Create the mission whose card opens this conversation. */
async function seedMission(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: MISSION_TITLE, status: "needs_you" },
  });
}

/** Put the deployment into multiplayer (what the real gateway advertises). */
async function armMultiplayer(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

/** One rendered row, found by the words it carries. */
const row = (page: Page, text: string): Locator =>
  page.locator("[data-conversation-message-key]").filter({ hasText: text });

/** The visible sender-name line inside a row (absent on own + continuations). */
const nameLine = (within: Locator): Locator =>
  within.locator("[data-chat-sender-name]");

/** The teammate face / agent mark of a row's sender line. */
const face = (within: Locator): Locator =>
  within.locator('[data-slot="avatar"]');

/** Open the spec's mission on the signed-in shell. */
async function openMission(page: Page): Promise<void> {
  await page.getByText(MISSION_TITLE).click();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
}

test("a shared chat gives every speaker a side, a face and a name", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await seedMission(request);
  await seedTranscript(request, "group");
  await signInAsViewer(page);
  await openMission(page);

  // A teammate opens the thread: LEFT-aligned bubble, face beside it, name as
  // the bubble's first line, painted in her own stable person tone.
  const asked = row(page, ASKED);
  await expect(asked).toBeVisible();
  await expect(asked).toHaveClass(/is-peer/);
  await expect(asked).not.toHaveClass(/is-user/);
  await expect(nameLine(asked)).toHaveText(ADA.name);
  await expect(nameLine(asked)).toHaveClass(/text-person-name-/);
  await expect(face(asked)).toBeVisible();
  await expect(asked).toContainText("AL");

  // Ada's SECOND message, same run: still a left bubble, but bare. No repeated
  // face, no repeated name.
  const again = row(page, "And drop anything below ten thousand");
  await expect(again).toHaveClass(/is-peer/);
  await expect(nameLine(again)).toHaveCount(0);
  await expect(face(again)).toHaveCount(0);

  // The link she sent renders as the Slack-style link chip (HOU-1152): the
  // soft link tint IS the resting affordance (underline only ADDS on hover),
  // so what must hold as rendered is the tint — the link token at 10% alpha.
  const peerLink = again.locator(`a[href="${PEER_LINK}"]`);
  await expect(peerLink).toBeVisible();
  const peerLinkBg = await peerLink.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(peerLinkBg).toMatch(/\/ 0\.1\)$/);

  // The agent's own turn: the Houston mark (an inline glyph) plus its name,
  // carrying the agent's own colour.
  const replied = row(page, REPLIED);
  await expect(nameLine(replied)).toHaveText("Houston");
  await expect(nameLine(replied)).toHaveClass(/text-agent-|text-ink/);
  await expect(replied.locator("svg")).toBeVisible();

  // The agent's SECOND consecutive turn is the same run: no repeated name, no
  // repeated mark.
  const repliedAgain = row(page, REPLIED_AGAIN);
  await expect(repliedAgain).toBeVisible();
  await expect(nameLine(repliedAgain)).toHaveCount(0);
  await expect(repliedAgain.locator("svg")).toHaveCount(0);

  // A SECOND human, so the run broke and attribution is not a one-author
  // illusion.
  const followUp = row(page, FOLLOWED_UP);
  await expect(followUp).toHaveClass(/is-peer/);
  await expect(nameLine(followUp)).toHaveText(BO.name);
  await expect(face(followUp)).toBeVisible();

  // The VIEWER's own turn: right-aligned as ever, unnamed and unfaced.
  const mine = row(page, MINE);
  await expect(mine).toHaveClass(/is-user/);
  await expect(mine).not.toHaveClass(/is-peer/);
  await expect(nameLine(mine)).toHaveCount(0);
  await expect(face(mine)).toHaveCount(0);
  // The side is a visual cue only, so a screen reader is told whose turn it is.
  await expect(mine.locator(".sr-only")).toHaveText("You");
});

test("a solo chat in multiplayer shows no sender on any turn", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await seedMission(request);
  await seedTranscript(request, "solo");
  await signInAsViewer(page);
  await openMission(page);

  const asked = row(page, ASKED);
  await expect(asked).toBeVisible();
  await expect(face(asked)).toHaveCount(0);
  await expect(nameLine(asked)).toHaveCount(0);
  // Every human turn stays on the right: nothing mirrors without attribution.
  await expect(asked).toHaveClass(/is-user/);
  await expect(asked).not.toHaveClass(/is-peer/);

  // The agent's reply renders bare — no mark, no "Houston" line above it.
  const replied = row(page, REPLIED);
  await expect(replied).toBeVisible();
  await expect(replied).not.toContainText("Houston");
  await expect(replied.locator("svg")).toHaveCount(0);
});

test("a teammate's wordless turn still says who it came from", async ({
  page,
  request,
}) => {
  // A user turn can carry no renderable words (an attachment-only send, a
  // display text the runtime blanked). The bubble body is empty, but the
  // byline is not optional: an anonymous bubble in a group chat is worse than
  // an empty one.
  await armMultiplayer(request);
  await seedMission(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: ASKED, ts: 1, author: ADA },
        { role: "user", content: "", ts: 2, author: BO },
      ],
    },
  });
  await signInAsViewer(page);
  await openMission(page);

  await expect(row(page, ASKED)).toBeVisible();
  const wordless = page
    .locator("[data-conversation-message-key].is-peer")
    .filter({ hasText: BO.name });
  await expect(nameLine(wordless)).toHaveText(BO.name);
  // The face column is kept too, so the bubble lines up with every other one.
  await expect(face(wordless)).toBeVisible();
});
