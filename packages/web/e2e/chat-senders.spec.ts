import { FAKE_HOST_URL, SEED_AGENT_NAME } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

test.use({ baseURL: AUTH_WEB_URL });

const MISSION_ID = "act-shared";
const MISSION_TITLE = "Q3 pipeline handover";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

const ADA = { userId: "user_a", name: "Ada Lovelace" };
const BO = { userId: "user_b", name: "Bo Diaz" };
const SELF = { userId: E2E_VIEWER.uid, name: E2E_VIEWER.displayName };

const ASKED = "Rebuild the Q3 pipeline report";
const PEER_LINK = "https://example.com/q3-pipeline";
const ADA_AGAIN = `And drop anything below ten thousand, see ${PEER_LINK}`;
const REPLIED = "Sixty-three open deals, cross-checked.";
const REPLIED_AGAIN = "The CRM export is attached.";
const FOLLOWED_UP = "Exclude the churned accounts";
const MINE = "Also flag the renewals";

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

async function seedMission(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: MISSION_TITLE, status: "needs_you" },
  });
}

async function armMultiplayer(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

const row = (page: Page, text: string): Locator =>
  page.locator("[data-conversation-message-key]").filter({ hasText: text });

const nameLine = (within: Locator): Locator =>
  within.locator("[data-chat-sender-name]");

const face = (within: Locator): Locator =>
  within.locator('[data-slot="avatar"]');

const mark = (within: Locator): Locator =>
  within.locator("svg:not([data-chat-message-actions] svg)");

const srOnly = (within: Locator): Locator =>
  within.locator(".sr-only:not([data-chat-message-actions] .sr-only)");

async function openMission(page: Page): Promise<void> {
  await page.getByText(MISSION_TITLE).click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
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

  const asked = row(page, ASKED);
  await expect(asked).toBeVisible();
  await expect(asked).toHaveClass(/is-peer/);
  await expect(asked).not.toHaveClass(/is-user/);
  await expect(nameLine(asked)).toHaveText(ADA.name);
  await expect(nameLine(asked)).toHaveClass(/text-person-name-/);
  await expect(face(asked)).toBeVisible();
  await expect(asked).toContainText("AL");

  const again = row(page, "And drop anything below ten thousand");
  await expect(again).toHaveClass(/is-peer/);
  await expect(nameLine(again)).toHaveCount(0);
  await expect(face(again)).toHaveCount(0);

  const peerLink = again.locator(`a[href="${PEER_LINK}"]`);
  await expect(peerLink).toBeVisible();
  const peerLinkBg = await peerLink.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(peerLinkBg).toMatch(/\/ 0\.1\)$/);

  const replied = row(page, REPLIED);
  await expect(nameLine(replied)).toHaveText(SEED_AGENT_NAME);
  await expect(nameLine(replied)).toHaveClass(/text-agent-|text-ink/);
  await expect(mark(replied)).toBeVisible();

  const repliedAgain = row(page, REPLIED_AGAIN);
  await expect(repliedAgain).toBeVisible();
  await expect(nameLine(repliedAgain)).toHaveCount(0);
  await expect(mark(repliedAgain)).toHaveCount(0);

  const followUp = row(page, FOLLOWED_UP);
  await expect(followUp).toHaveClass(/is-peer/);
  await expect(nameLine(followUp)).toHaveText(BO.name);
  await expect(face(followUp)).toBeVisible();

  const mine = row(page, MINE);
  await expect(mine).toHaveClass(/is-user/);
  await expect(mine).not.toHaveClass(/is-peer/);
  await expect(nameLine(mine)).toHaveCount(0);
  await expect(face(mine)).toHaveCount(0);
  await expect(srOnly(mine)).toHaveText("You");
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
  await expect(asked).toHaveClass(/is-user/);
  await expect(asked).not.toHaveClass(/is-peer/);

  const replied = row(page, REPLIED);
  await expect(replied).toBeVisible();
  await expect(replied).not.toContainText(SEED_AGENT_NAME);
  await expect(mark(replied)).toHaveCount(0);
});

test("a teammate's wordless turn still says who it came from", async ({
  page,
  request,
}) => {
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
  await expect(face(wordless)).toBeVisible();
});
