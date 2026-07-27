import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * HOU-943 — in a SHARED chat every turn says who sent it: the teammate's face +
 * name on human messages, the agent's mark + name on its own. Single-player is
 * untouched (no names, no faces).
 *
 * The shared shape can't be produced by a local turn (only the cloud gateway
 * stamps a message's `author`), so the transcript is armed on the fake host
 * (`/__test__/chat-history`) alongside multiplayer capabilities — the same
 * wire shape `GET /agents/:id/conversations/:id/history` serves in the cloud.
 * That makes this a real regression test for the whole pipeline: history →
 * `historyToFeed` → the SDK conversation VM → `ui/chat`'s sender line.
 */

/**
 * The spec's OWN mission + its conversation. Created here rather than reusing a
 * seeded card so the transcript is the only thing under test: a fresh activity
 * carries no server-stamped contributors, so it stays visible under the board's
 * default person scope in multiplayer (`missionMatchesScope`'s unattributed
 * clause) whatever the fixtures stamp on the seeded missions.
 */
const MISSION_ID = "act-shared";
const MISSION_TITLE = "Q3 pipeline handover";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

const ADA = { userId: "user_a", name: "Ada Lovelace" };
const BO = { userId: "user_b", name: "Bo Diaz" };

const ASKED = "Rebuild the Q3 pipeline report";
const REPLIED = "Sixty-three open deals, cross-checked.";
const FOLLOWED_UP = "Exclude the churned accounts";

/** Arm a two-author transcript. `authored: false` seeds the same words with no
 *  author — a single-player conversation. */
async function seedTranscript(
  request: APIRequestContext,
  authored: boolean,
): Promise<void> {
  const author = (who: typeof ADA) => (authored ? { author: who } : {});
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: ASKED, ts: 1, ...author(ADA) },
        { role: "assistant", content: REPLIED, ts: 2 },
        { role: "user", content: FOLLOWED_UP, ts: 3, ...author(BO) },
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

/** The rendered message rows (each carries its stable conversation key). */
const rows = (page: import("@playwright/test").Page) =>
  page.locator("[data-conversation-message-key]");

test("a shared chat names and faces the sender of every turn", async ({
  page,
  request,
}) => {
  await armMultiplayer(request);
  await seedMission(request);
  await seedTranscript(request, true);
  await page.goto("/");
  await page.getByText(MISSION_TITLE).click();

  const asked = rows(page).filter({ hasText: ASKED });
  await expect(asked).toBeVisible();
  // The teammate who wrote it: name + a face (their initials, no photo here).
  await expect(asked).toContainText(ADA.name);
  await expect(asked.locator('[data-slot="avatar"]')).toBeVisible();
  await expect(asked).toContainText("AL");

  // The agent's own turn: its name + the Houston mark (an inline glyph).
  const replied = rows(page).filter({ hasText: REPLIED });
  await expect(replied).toContainText("Houston");
  await expect(replied.locator("svg")).toBeVisible();

  // The SECOND human, so attribution is not a one-author illusion.
  const followUp = rows(page).filter({ hasText: FOLLOWED_UP });
  await expect(followUp).toContainText(BO.name);
  await expect(followUp.locator('[data-slot="avatar"]')).toBeVisible();
});

test("a single-player chat shows no sender on any turn", async ({
  page,
  request,
}) => {
  await seedMission(request);
  await seedTranscript(request, false);
  await page.goto("/");
  await page.getByText(MISSION_TITLE).click();

  const asked = rows(page).filter({ hasText: ASKED });
  await expect(asked).toBeVisible();
  await expect(asked.locator('[data-slot="avatar"]')).toHaveCount(0);

  // The agent's reply renders bare — no mark, no "Houston" line above it.
  const replied = rows(page).filter({ hasText: REPLIED });
  await expect(replied).toBeVisible();
  await expect(replied).not.toContainText("Houston");
  await expect(replied.locator("svg")).toHaveCount(0);
});
