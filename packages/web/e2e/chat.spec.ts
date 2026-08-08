import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The core loop: open a new conversation, send a message, and watch the streamed
 * reply render. The fake host streams a canned reply over SSE (text deltas →
 * usage → done), exactly like the real runtime, so this exercises the whole
 * chat pipeline: composer → createMission → startSession → SSE → feed render.
 */
/**
 * One rendered row, addressed by SIDE and by the words it carries. The
 * per-message key is `<kind>-<feedId>`, so the prefix separates a user bubble
 * from the agent reply that quotes the same words back — without it, a text
 * filter matches both.
 */
const userRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

const agentRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="assistant-"]')
    .filter({ hasText: text });

test("sends a message and renders the streamed reply", async ({ page }) => {
  await page.goto("/");

  // The header "New mission" button (a tour anchor, so a stable selector). There
  // is a second "New mission" affordance — the "+" card in the Running column.
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();

  await composer.fill("plan my week");
  await composer.press("Enter");

  // The user's message renders optimistically.
  await expect(page.getByText("plan my week").first()).toBeVisible();

  // The streamed assistant reply (canned by the fake host). Match without the
  // quotes so a markdown smart-quote transform can't flake the assertion.
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

/** Sending with the composer's Submit button, not the Enter key. */
test("sends a message with the Submit button", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  await page
    .getByPlaceholder("What should the agent work on?")
    .fill("water the plants");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("water the plants").first()).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

/**
 * HOU-640: the first send must not flicker. AIBoard used to close its "new
 * mission" state as soon as the created activity was selected, but the detail
 * panel was gated on that activity being present in the refetched board
 * query — so the whole chat panel unmounted until the refetch landed, then
 * remounted. Stall the activity-list refetch and assert the optimistic user
 * message renders immediately and stays visible through the whole window.
 */
test("first message keeps the chat panel mounted while the board refetches", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill("no flicker please");

  // Once the create path has written the new activity (the PUT), stall every
  // re-read of the board's activity list (both the files-first activity.json
  // read and the REST route): the created activity stays absent from the
  // board query for a beat — exactly the window where the panel used to
  // unmount. The create path's own read-modify-write must NOT stall, so the
  // stall arms only after the PUT.
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

  // The user's message renders right away, well before the stalled refetch
  // resolves...
  const message = page.getByText("no flicker please").first();
  await expect(message).toBeVisible({ timeout: 1_000 });

  // ...and never disappears — neither while the refetch is still pending nor
  // when it lands and the panel switches to the resolved activity.
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    await expect(message).toBeVisible({ timeout: 100 });
  }
});

/**
 * Reconnect resilience — the settle-on-close truncation regression. The SSE
 * stream is severed server-side mid-turn (a simulated network blip) while the
 * turn keeps producing into the fake host's replay log; the client must
 * silently reconnect with its `?after=<seq>` cursor and render the reply IN
 * FULL — never settle a truncated bubble from the partial text.
 */
test("recovers a dropped stream mid-turn and renders the full reply", async ({
  page,
  request,
}) => {
  // Slow the canned reply (3 deltas x 800ms) so the drop lands mid-turn.
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: { replyDelayMs: 800 },
  });
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await composer.fill("test reconnect");
  await composer.press("Enter");

  // The first streamed delta rendered — the turn is mid-flight.
  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  // Sever every open chat stream. The turn keeps running server-side.
  const drop = await request.post(
    `${FAKE_HOST_URL}/__test__/drop-chat-streams`,
  );
  expect(((await drop.json()) as { dropped: number }).dropped).toBeGreaterThan(
    0,
  );

  // The client reconnects with its cursor and the FULL reply lands (the `.`
  // wildcards absorb a markdown smart-quote transform).
  await expect(page.getByText(/You said: .test reconnect./)).toBeVisible({
    timeout: 15_000,
  });
});

/**
 * Reconnect across a TURN BOUNDARY. Our turn ends (terminal frame lost, replay
 * buffer cleared) and ANOTHER turn is already running when the client comes
 * back — the resync/replay names a different turnId. The client must settle
 * OUR turn from persisted history matched by turnId: the full reply renders,
 * no error surface, and the new foreign turn's frames are never spliced in.
 */
test("settles the interrupted turn from history by turnId across a turn boundary", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: { replyDelayMs: 800 },
  });
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await composer.fill("test boundary");
  await composer.press("Enter");

  // The first streamed delta rendered — the turn is mid-flight.
  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  // Sever the stream, finish OUR turn into history, start the NEXT turn.
  const res = await request.post(`${FAKE_HOST_URL}/__test__/turn-boundary`, {
    data: { nextText: "someone else's turn" },
  });
  expect(((await res.json()) as { advanced: number }).advanced).toBe(1);

  // OUR full reply settles from history by turnId (the `.` wildcards absorb a
  // markdown smart-quote transform)...
  await expect(page.getByText(/You said: .test boundary./)).toBeVisible({
    timeout: 15_000,
  });
  // ...with no error surface, and without splicing the foreign turn's reply.
  await expect(page.getByText(/Session error/)).not.toBeVisible();
  await expect(page.getByText(/someone else.s turn/)).not.toBeVisible();
});

/**
 * The dead-turn settle: the host's reaper detects a dead turn and synthesizes
 * a terminal `error` frame carrying the dead turn's turnId. The client must
 * settle the turn as an error with the reaper's copy — never an eternal
 * spinner, never an empty "completed" bubble.
 */
test("a dead turn settles as an error with the reaper's message", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: { replyDelayMs: 800 },
  });
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
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

/** Replying inside an EXISTING mission (the follow-up composer), not a new one. */
test("sends a follow-up inside an existing mission", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();

  await composer.fill("what about the budget?");
  await composer.press("Enter");

  await expect(page.getByText("what about the budget?").first()).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

/**
 * Edit-and-resend (PRODUCT-1217), ChatGPT grammar: hovering a previous user
 * message reveals its actions; Edit swaps the bubble for an IN-PLACE editor
 * (Cancel / Send, composer untouched). Escape cancels cleanly; Send rewinds
 * the conversation to that message — earlier turns stay, the edited turn's
 * old exchange is gone, and the agent answers the edited text.
 */
test("edits a previous user message in place and rewinds the conversation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder("Send a follow-up...");

  // Two settled turns.
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

  // Hover the SECOND user bubble to reveal its actions, then edit in place.
  // Scoped to that ROW, never `.last()` over the whole page: an action row
  // renders per message, so a page-wide pick silently lands on a different
  // turn whenever this one's button has not mounted yet.
  const secondRow = userRow(page, "second message");
  const secondBubble = page.getByText("second message", { exact: true });
  await secondRow.hover();
  await secondRow.getByRole("button", { name: "Edit message" }).click();
  const editor = page.getByRole("textbox", { name: "Edit message" });
  await expect(editor).toHaveValue("second message");
  // The composer is untouched — editing happens in the bubble.
  await expect(composer).toHaveValue("");

  // Escape abandons the edit and restores the bubble...
  await editor.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(secondBubble).toBeVisible();

  // ...and a fresh edit sends the rewind.
  await secondRow.hover();
  await secondRow.getByRole("button", { name: "Edit message" }).click();
  await editor.fill("second message, edited");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The edited turn answers; the editor is gone.
  await expect(
    page.getByText(/You said: .second message, edited./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(editor).not.toBeVisible();
  // The rewound tail is gone; the first turn survives untouched.
  await expect(
    page.getByText("second message", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/You said: .second message[”"]/),
  ).not.toBeVisible();
  await expect(page.getByText(/You said: .first message./)).toBeVisible();
});
/**
 * Copy a message (PRODUCT-1217 follow-up): both sides of the conversation
 * carry a hover-revealed copy action on settled rows — the user's bubble
 * copies the typed text, the agent's copies its markdown source.
 */
test("copies a user and an agent message to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await composer.fill("copy me please");
  await composer.press("Enter");
  await expect(page.getByText(/You said: .copy me please./)).toBeVisible({
    timeout: 15_000,
  });

  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  // The actions reveal on hover (ChatGPT grammar). Row-scoped for the same
  // reason as the edit test: `.first()`/`.last()` over the page would drift
  // onto another turn's button.
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
  await page.getByText("Plan a trip to Tokyo").click();

  // Two exchanges make the map useful enough to exercise both its outline and
  // all-message search modes.
  const composer = page.getByPlaceholder("Send a follow-up...");
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
