import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";

/**
 * Sending to an agent whose pod is asleep (PRODUCT-1643).
 *
 * On a cloud boot, or after an idle pod scales to zero while the app stays
 * open, EVERY per-agent read is held by the gateway for the whole cold start.
 * The send paths used to await such reads (the mission's pin lookup, the board
 * row's read-modify-write) BEFORE the turn stream could push the user's
 * bubble — so Enter did nothing visible for seconds and the send button read
 * as dead. The fake host's cold-start hold models the gateway: every
 * per-agent GET stalls for the armed window, writes and the turn's POST go
 * through, and the reply's SSE (a GET) lands once the hold lifts — exactly
 * like a pod waking up.
 *
 * The proof in both specs is the timing gap: the bubble must show well inside
 * the hold, and the reply must still arrive after it.
 */
const HOLD_MS = 8_000;
/** Far under the hold, generous enough for a contended CI runner. */
const BUBBLE_GRACE_MS = 3_000;

const userRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

async function holdAgentReads(
  request: Parameters<Parameters<typeof test>[2]>[0]["request"],
  ms: number,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms },
  });
}

test("a follow-up sent to an asleep pod shows the message instantly", async ({
  page,
  request,
}) => {
  await page.goto("/");
  // Open an existing mission while the pod answers: the chat panel mounts and
  // caches the board's activity list, like any chat the user had open.
  await page.getByText("Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();

  // The pod falls asleep under the open chat.
  await holdAgentReads(request, HOLD_MS);

  await composer.fill("also book the hotel");
  await composer.press("Enter");

  // The bubble renders off the cached pin — no held read in front of it.
  await expect(userRow(page, "also book the hotel")).toBeVisible({
    timeout: BUBBLE_GRACE_MS,
  });
  // The composer let go of the text the moment the send was on screen.
  await expect(composer).toHaveValue("");

  // The reply streams once the "pod" is up again.
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: HOLD_MS + 15_000,
  });
});

test("a new mission sent to an asleep pod shows the message instantly", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();

  // The pod falls asleep before the first message is sent: the board row's
  // read-modify-write is now held, and must not stand between Enter and the
  // bubble.
  await holdAgentReads(request, HOLD_MS);

  await composer.fill("plan the offsite");
  await composer.press("Enter");

  await expect(userRow(page, "plan the offsite")).toBeVisible({
    timeout: BUBBLE_GRACE_MS,
  });

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: HOLD_MS + 15_000,
  });
});
