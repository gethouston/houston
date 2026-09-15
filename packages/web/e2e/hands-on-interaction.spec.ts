import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";
import { openAssistant } from "./support/settings-nav";
import { missionCard } from "./support/team-nav";

/**
 * The hands-on errand: work only the person's own hands can finish on a Houston
 * screen. Nothing can observe it, so the card asks — and both answers must get
 * the agent moving again, exactly once.
 */

const composer = (page: Page) => page.getByPlaceholder("Send a follow-up...");
const ASK = "Connect my accounting app to Houston";

const queueErrand = (request: APIRequestContext, reason: string) =>
  request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [{ kind: "hands_on", id: "h1", surface: "apiKeys", reason }],
      },
    },
  });

/** Reach the chat that will carry the errand card, on either surface. */
async function openSurface(page: Page, surface: "manager" | "mission") {
  if (surface === "mission") {
    await startMission(page, ASK);
    return;
  }
  await page.goto("/");
  await openAssistant(page);
  await composer(page).fill(ASK);
  await composer(page).press("Enter");
}

/**
 * Walk back from the screen the errand opened. Browser back returns to the
 * surface the card was queued on; a mission's chat is a panel over its board,
 * so the card is one more click in — the same trip the person makes.
 */
async function returnToChat(page: Page, surface: "manager" | "mission") {
  await page.goBack();
  // `.first()`: the card repeats the task text as its own preview line.
  if (surface === "mission") await missionCard(page, ASK).first().click();
}

for (const surface of ["manager", "mission"] as const) {
  test(`${surface} sends the user to the screen and resumes once on Done`, async ({
    page,
    request,
  }) => {
    const sent: Record<string, unknown>[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/conversations\/[^/]+\/messages$/.test(req.url())
      ) {
        sent.push(req.postDataJSON() as Record<string, unknown>);
      }
    });
    const reason = "Copy the key Houston shows you once.";
    await queueErrand(request, reason);
    await openSurface(page, surface);

    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await expect(composer(page)).toHaveCount(0);

    // The CTA is real navigation, not a link in prose: it lands the person on
    // the API keys screen itself. The card's title names the screen; the button
    // carries the bare verb, the way the connect cards do.
    await expect(
      page.getByText("Open API keys", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "API keys", level: 2 }),
    ).toBeVisible();

    // Back the way they came. The card holds no state across that round trip,
    // so Done must still be the answer waiting for them.
    await returnToChat(page, surface);
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await expect(composer(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
    // The person never typed this, so no bubble of theirs may appear.
    await expect(
      page
        .locator('[data-conversation-message-key^="user-"]')
        .filter({ hasText: "Opened API keys" }),
    ).toHaveCount(0);
    // The opening message plus ONE resume: a second nudge would start a second
    // turn and queue the errand all over again.
    await expect.poll(() => sent.length).toBe(2);
  });

  test(`${surface} tells the agent plainly when the errand is skipped`, async ({
    page,
    request,
  }) => {
    const sent: Record<string, unknown>[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/conversations\/[^/]+\/messages$/.test(req.url())
      ) {
        sent.push(req.postDataJSON() as Record<string, unknown>);
      }
    });
    const reason = "Only you can copy that key.";
    await queueErrand(request, reason);
    await openSurface(page, surface);

    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Skip/ }).click();

    await expect(composer(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
    await expect.poll(() => sent.length).toBe(2);
    // A skip is a FACT the agent must hear, or it waits forever on a key the
    // person already decided not to fetch.
    expect(JSON.stringify(sent)).toContain("Skipped opening API keys.");
  });
}
