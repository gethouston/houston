import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import {
  FOLLOW_UP_PLACEHOLDER,
  NEW_TASK_PLACEHOLDER,
} from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";
import { missionCard } from "./support/team-nav";

const userRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

const agentRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="assistant-"]')
    .filter({ hasText: text });

const MID_TURN_CONFIG = { replyDelayMs: 2_500, holdAfterFirstDelta: true };

test("sends a message and renders the streamed reply", async ({ page }) => {
  await page.goto("/");

  await openNewMission(page);

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await composer.fill("plan my week");
  await composer.press("Enter");

  await expect(userRow(page, "plan my week")).toBeVisible();

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

test("sends a message with the Submit button", async ({ page }) => {
  await page.goto("/");
  await openNewMission(page);

  await page.getByPlaceholder(NEW_TASK_PLACEHOLDER).fill("water the plants");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(userRow(page, "water the plants")).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

test("first message keeps the chat panel mounted while the board refetches", async ({
  page,
}) => {
  await page.goto("/");
  await openNewMission(page);

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill("no flicker please");

  let activityWritten = false;
  await page.route(/\/activity\.json$|\/activities$/, async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      activityWritten = true;
    } else if (activityWritten && req.method() === "GET") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });

  await composer.press("Enter");

  const message = userRow(page, "no flicker please");
  await expect(message).toBeVisible({ timeout: 1_000 });

  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    await expect(message).toBeVisible({ timeout: 100 });
  }
});

test("recovers a dropped stream mid-turn and renders the full reply", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: MID_TURN_CONFIG,
  });
  await page.goto("/");
  await openNewMission(page);

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("test reconnect");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  const drop = await request.post(
    `${FAKE_HOST_URL}/__test__/drop-chat-streams`,
  );
  expect(((await drop.json()) as { dropped: number }).dropped).toBeGreaterThan(
    0,
  );

  await expect(page.getByText(/You said: .test reconnect./)).toBeVisible({
    timeout: 15_000,
  });
});

test("settles the interrupted turn from history by turnId across a turn boundary", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: MID_TURN_CONFIG,
  });
  await page.goto("/");
  await openNewMission(page);

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("test boundary");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  const res = await request.post(`${FAKE_HOST_URL}/__test__/turn-boundary`, {
    data: { nextText: "someone else's turn" },
  });
  expect(((await res.json()) as { advanced: number }).advanced).toBe(1);

  await expect(page.getByText(/You said: .test boundary./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Session error/)).not.toBeVisible();
  await expect(agentRow(page, "test boundary")).not.toContainText(
    "someone else",
  );
  await expect(userRow(page, "someone else's turn")).toHaveCount(1);
});

test("a dead turn settles as an error with the reaper's message", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: MID_TURN_CONFIG,
  });
  await page.goto("/");
  await openNewMission(page);

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("test dead turn");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  const res = await request.post(`${FAKE_HOST_URL}/__test__/kill-turn`);
  expect(((await res.json()) as { killed: number }).killed).toBe(1);

  await expect(
    page.getByText(/The turn ended unexpectedly/).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test("sends a follow-up inside an existing mission", async ({ page }) => {
  await page.goto("/");

  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await composer.fill("what about the budget?");
  await composer.press("Enter");

  await expect(page.getByText("what about the budget?").first()).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

test("edits a previous user message in place and rewinds the conversation", async ({
  page,
}) => {
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);

  await composer.fill("first message");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .first message./)).toBeVisible({
    timeout: 15_000,
  });
  await composer.fill("second message");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .second message[”"]/)).toBeVisible({
    timeout: 15_000,
  });

  const secondRow = userRow(page, "second message");
  const secondBubble = page.getByText("second message", { exact: true });
  await expect(async () => {
    await secondRow.hover();
    await secondRow
      .getByRole("button", { name: "Edit message" })
      .click({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const editor = page.getByRole("textbox", { name: "Edit message" });
  await expect(editor).toHaveValue("second message");
  await expect(composer).toHaveValue("");

  await editor.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(secondBubble).toBeVisible();

  await expect(async () => {
    await secondRow.hover();
    await secondRow
      .getByRole("button", { name: "Edit message" })
      .click({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await editor.fill("second message, edited");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByText(/You said: .second message, edited./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(editor).not.toBeVisible();
  await expect(
    page.getByText("second message", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/You said: .second message[”"]/),
  ).not.toBeVisible();
  await expect(page.getByText(/You said: .first message./)).toBeVisible();
});
test("copies a user and an agent message to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await composer.fill("copy me please");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .copy me please./)).toBeVisible({
    timeout: 15_000,
  });

  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  const mine = userRow(page, "copy me please");
  await mine.hover();
  await mine.getByRole("button", { name: "Copy message" }).click();
  expect(await clipboard()).toBe("copy me please");

  const reply = agentRow(page, "You said:");
  await reply.hover();
  await reply.getByRole("button", { name: "Copy message" }).click();
  expect(await clipboard()).toContain("You said:");
});

test("searches and navigates a long conversation with the map", async ({
  page,
}) => {
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();

  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await composer.fill("show me the budget");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .show me the budget./)).toBeVisible({
    timeout: 15_000,
  });
  await composer.fill("now the hotels");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .now the hotels./)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Chat actions" }).click();
  const actions = page.getByRole("menu");
  await expect(actions.getByRole("menuitem", { name: "Find" })).toBeVisible();
  await expect(
    actions.getByRole("menuitem", { name: "Move to done" }),
  ).toBeVisible();
  await expect(actions.getByRole("menuitem", { name: "Delete" })).toHaveClass(
    /text-danger/,
  );
  await expect(actions.locator("svg")).toHaveCount(3);
  await actions.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    page.getByRole("alertdialog").getByText('Delete "Plan a trip to Tokyo"?'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Chat actions" }).click();
  await actions.getByRole("menuitem", { name: "Find" }).click();
  const map = page.getByRole("navigation", { name: "Search chat" });
  await expect(map).toBeVisible();
  const search = page.getByRole("combobox", { name: "Search messages" });
  await expect(search).toHaveValue("");
  await expect(map.getByRole("option")).toHaveCount(3);

  await search.fill("hotels");
  await expect(map.getByRole("option")).toHaveCount(3);
  await expect(map).toContainText("now the hotels");

  await search.fill("no matching message");
  await expect(map.getByText("No messages match your search.")).toBeVisible();

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(map.getByRole("option")).toHaveCount(3);

  const firstMoment = map.getByRole("option").first();
  await firstMoment.click();
  await expect(map).not.toBeVisible();
  await expect(page.getByLabel("Selected message")).toBeFocused();

  await page.getByRole("button", { name: "Chat actions" }).click();
  await page.getByRole("menuitem", { name: "Find" }).click();
  await map.getByRole("option", { name: "Back to latest" }).click();
  await expect(map).not.toBeVisible();

  await page.getByRole("button", { name: "Chat actions" }).click();
  await page.getByRole("menuitem", { name: "Find" }).click();
  await search.focus();
  await search.press("Escape");
  await expect(
    page.getByRole("button", { name: "Chat actions" }),
  ).toBeFocused();
});

test("keeps mission actions available when an empty chat has nothing to find", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Draft the launch email").click();

  await page.getByRole("button", { name: "Chat actions" }).click();
  const actions = page.getByRole("menu");
  await expect(actions.getByRole("menuitem", { name: "Find" })).toHaveAttribute(
    "data-disabled",
  );
  await expect(
    actions.getByRole("menuitem", { name: "Move to done" }),
  ).toHaveCount(0);
  await expect(actions.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("a map result scrolls its message into the conversation viewport", async ({
  page,
  request,
}) => {
  const missionId = "act-map-jump";
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: missionId, title: "Map jump", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${missionId}`,
      messages: Array.from({ length: 30 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Checkpoint ${index}. ${"Long conversation detail. ".repeat(8)}`,
        ts: index + 1,
      })),
    },
  });

  await page.goto("/");
  await page.getByText("Map jump").first().click();

  const scrollPane = page.locator(".conversation-scroll-pane");
  await expect
    .poll(() =>
      scrollPane.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(2);
  const before = await scrollPane.evaluate((element) => element.scrollTop);

  await page.getByRole("button", { name: "Chat actions" }).click();
  await page.getByRole("menuitem", { name: "Find" }).click();
  await page
    .getByRole("combobox", { name: "Search messages" })
    .fill("Checkpoint 0");
  await page.getByRole("option", { name: /Checkpoint 0/ }).click();

  await expect
    .poll(() => scrollPane.evaluate((element) => element.scrollTop))
    .toBeLessThan(before / 2);
  const target = page
    .locator("[data-conversation-message-key]")
    .filter({ hasText: "Checkpoint 0" })
    .first();
  await expect(target).toBeFocused();
  await expect
    .poll(async () => {
      const paneBox = await scrollPane.boundingBox();
      const targetBox = await target.boundingBox();
      if (!paneBox || !targetBox) return false;
      return (
        targetBox.y >= paneBox.y &&
        targetBox.y + targetBox.height <= paneBox.y + paneBox.height
      );
    })
    .toBe(true);
});

test("a tool-backed answer uses its rendered message anchor", async ({
  page,
  request,
}) => {
  const missionId = "act-map-tool-anchor";
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: missionId, title: "Tool anchor", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${missionId}`,
      messages: [
        { role: "user", content: "Research this", ts: 1 },
        {
          role: "assistant",
          content: "Tool-backed answer near the beginning",
          thinking: "I should search first",
          tools: [{ name: "search", result: "Found it" }],
          ts: 2,
        },
        ...Array.from({ length: 24 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `Later message ${index}. ${"More detail. ".repeat(8)}`,
          ts: index + 3,
        })),
      ],
    },
  });

  await page.goto("/");
  await page.getByText("Tool anchor").first().click();
  await page.getByRole("button", { name: "Chat actions" }).click();
  await page.getByRole("menuitem", { name: "Find" }).click();
  await page
    .getByRole("combobox", { name: "Search messages" })
    .fill("Tool-backed answer");
  await page.getByRole("option", { name: /Tool-backed answer/ }).click();

  const target = page.locator('[data-conversation-message-key$="-content"]', {
    hasText: "Tool-backed answer near the beginning",
  });
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("aria-label", "Selected message");
});
