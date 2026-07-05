import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The core loop: open a new conversation, send a message, and watch the streamed
 * reply render. The fake host streams a canned reply over SSE (text deltas →
 * usage → done), exactly like the real runtime, so this exercises the whole
 * chat pipeline: composer → createMission → startSession → SSE → feed render.
 */
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
