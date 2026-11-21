import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, E2E_VIEWER, signInAsViewer } from "./support/identity";

test.use({ baseURL: AUTH_WEB_URL });

const MISSION_ID = "act-mentions";
const MISSION_TITLE = "Quarterly close checklist";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

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

async function armMultiplayer(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
}

async function armRoster(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: [GHOST, SELF, BOB] },
  });
}

async function seedMission(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: MISSION_TITLE, status: "needs_you" },
  });
}

const userRows = (page: Page) =>
  page.locator("[data-conversation-message-key].is-user");
const agentRows = (page: Page) =>
  page.locator("[data-conversation-message-key]:not(.is-user)");
const composerOf = (page: Page) => page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
const popover = (page: Page) => page.locator("[data-mention-popover]");
const option = (page: Page, userId: string) =>
  page.locator(`[data-mention-option="${userId}"]`);

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

  await composer.pressSequentially("Ping @Bo");
  await expect(popover(page)).toBeVisible();
  const listbox = popover(page).locator('[role="listbox"]');
  await expect(listbox).toBeVisible();
  const bob = option(page, "u-bob");
  await expect(bob).toHaveAttribute("role", "option");

  await expect(composer).toHaveAttribute("role", "combobox");
  await expect(composer).toHaveAttribute("aria-expanded", "true");
  const listboxId = await listbox.getAttribute("id");
  expect(listboxId).toBeTruthy();
  await expect(composer).toHaveAttribute("aria-controls", String(listboxId));
  const activeId = await composer.getAttribute("aria-activedescendant");
  await expect(bob).toHaveAttribute("id", String(activeId));
  await expect(bob).toContainText("Bob Stone");
  await expect(bob.locator('[data-slot="avatar"]')).toBeVisible();
  await expect(bob).toContainText("BS");

  await bob.click();
  await expect(composer).toHaveValue("Ping @Bob Stone ");
  await expect(popover(page)).toHaveCount(0);
  await expect(composer).not.toHaveAttribute("role", "combobox");
  await expect(composer).not.toHaveAttribute("aria-expanded", "true");
  await expect(composer).not.toHaveAttribute("aria-activedescendant", /.*/);

  await composer.fill("");
  await composer.pressSequentially("Please loop in @");
  await expect(popover(page)).toBeVisible();
  await expect(option(page, E2E_VIEWER.uid)).toHaveCount(0);
  await expect(option(page, "u-ghost")).toHaveCount(0);
  await expect(popover(page).locator('[role="option"]')).toHaveCount(1);

  await page.keyboard.press("ArrowDown");
  await expect(bob).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("Please loop in @Bob Stone ");
  await expect(popover(page)).toHaveCount(0);

  await composer.press("Enter");
  const SENT = "Please loop in @Bob Stone";
  const sent = userRows(page).filter({ hasText: SENT });
  await expect(sent).toBeVisible();
  const chip = sent.locator("[data-mention-chip]");
  await expect(chip).toHaveText("@Bob Stone");
  await expect(chip).not.toHaveAttribute("data-mention-self", "");

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
  const ASKED = "Can @Bob Stone close it with @Ada Lovelace?";
  const REPLIED =
    "On it. @Ada Lovelace signed off and @Bob Stone has the file.";
  const FROM_BOB = "Sending it to @Ada Lovelace now";
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
        {
          role: "user",
          content: FROM_BOB,
          ts: 3,
          author: { userId: BOB.userId, name: BOB.displayName },
          mentions: [{ userId: SELF.userId, name: SELF.displayName }],
        },
      ],
    },
  });
  await signInAsViewer(page);
  await openMission(page);

  const asked = userRows(page).filter({ hasText: "Can @Bob Stone close it" });
  await expect(asked).toBeVisible();
  await expect(asked.locator("[data-mention-chip]")).toHaveText(["@Bob Stone"]);

  const replied = agentRows(page).filter({ hasText: "signed off" });
  await expect(replied).toBeVisible();
  const chips = replied.locator("[data-mention-chip]");
  await expect(chips).toHaveText(["@Ada Lovelace", "@Bob Stone"]);
  await expect(chips.first()).toHaveAttribute("data-mention-self", "");
  await expect(chips.last()).not.toHaveAttribute("data-mention-self", "");
  await expect(replied.locator("[data-mention-self]")).toHaveCount(1);

  const fromBob = page
    .locator("[data-conversation-message-key].is-peer")
    .filter({ hasText: "Sending it to" });
  await expect(fromBob).toBeVisible();
  await expect(fromBob.locator("[data-chat-sender-name]")).toHaveText(
    BOB.displayName,
  );
  const peerChip = fromBob.locator("[data-mention-chip]");
  await expect(peerChip).toHaveText(["@Ada Lovelace"]);
  await expect(peerChip).toHaveAttribute("data-mention-self", "");
});

test("single player never offers a mention list — @ is just a character", async ({
  page,
  request,
}) => {
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
