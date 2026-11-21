import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { ASSISTANT_COMPOSER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";
import { openAssistant } from "./support/settings-nav";
import { missionCard } from "./support/team-nav";

const composer = (page: Page) => page.getByPlaceholder(ASSISTANT_COMPOSER);
const ASK = "Connect my accounting app to Houston";

const queueErrand = (request: APIRequestContext, reason: string) =>
  request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [{ kind: "hands_on", id: "h1", surface: "apiKeys", reason }],
      },
    },
  });

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

const SECRET = `hst_${"5e1d0c7a".repeat(8)}`;

async function mockKeyMint(page: Page): Promise<() => number> {
  let mints = 0;
  await page.route("**/v1/keys**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ json: { keys: [] } });
    mints += 1;
    const { name } = req.postDataJSON() as { name: string };
    return route.fulfill({
      status: 201,
      json: {
        id: "key-1",
        name,
        prefix: "hst_5e1d",
        createdAt: "2026-10-05T12:00:00Z",
        key: SECRET,
      },
    });
  });
  return () => mints;
}

function recordRequests(page: Page) {
  const bodies: string[] = [];
  const resumes: Record<string, unknown>[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body) bodies.push(body);
    if (
      req.method() === "POST" &&
      /\/conversations\/[^/]+\/messages$/.test(req.url())
    )
      resumes.push(req.postDataJSON() as Record<string, unknown>);
  });
  return { bodies, resumes };
}

const ownBubble = (page: Page, text: string) =>
  page
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

test("the manager mints the key right in the chat and never sees it", async ({
  page,
  request,
}) => {
  const { bodies, resumes } = recordRequests(page);
  const mints = await mockKeyMint(page);
  const reason = "Create a key for your script and copy it.";
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { apiKeys: true },
  });
  await queueErrand(request, reason);
  await openSurface(page, "manager");

  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(composer(page)).toHaveCount(0);
  await expect(
    page.getByText("it is shown only once, and I never see it", {
      exact: false,
    }),
  ).toBeVisible();

  await expect(
    page.getByText("Create an API key", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Key name").fill("My script");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByText(SECRET, { exact: true })).toBeVisible();
  expect(mints()).toBe(1);
  await expect(page.getByText("Try your key", { exact: true })).toBeVisible();
  await expect(
    page.locator("pre").filter({ hasText: `Bearer ${SECRET}` }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /^Skip/ })).toHaveCount(0);
  await expect(
    page.getByPlaceholder("Or tell it what to do instead..."),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText(SECRET, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(composer(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect.poll(() => resumes.length).toBe(2);
  expect(JSON.stringify(resumes[1])).toContain("Finished API keys.");
  await expect(ownBubble(page, "Finished API keys.")).toHaveCount(0);
  expect(bodies.some((body) => body.includes("Finished API keys."))).toBe(true);
  expect(bodies.filter((body) => body.includes(SECRET))).toEqual([]);
  expect(mints()).toBe(1);
});

test("a mission's key errand still sends the person to the screen", async ({
  page,
  request,
}) => {
  const { resumes } = recordRequests(page);
  const mints = await mockKeyMint(page);
  const reason = "Copy the key Houston shows you once.";
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { apiKeys: true },
  });
  await queueErrand(request, reason);
  await openSurface(page, "mission");

  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Key name")).toHaveCount(0);
  await expect(page.getByText("Open API keys", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "API keys", level: 2 }),
  ).toBeVisible();

  await page.goBack();
  await missionCard(page, ASK).first().click();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await expect(composer(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => resumes.length).toBe(2);
  expect(JSON.stringify(resumes[1])).toContain("Finished API keys.");
  await expect(ownBubble(page, "Finished API keys.")).toHaveCount(0);
  expect(mints()).toBe(0);
});

for (const surface of ["manager", "mission"] as const) {
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
    expect(JSON.stringify(sent)).toContain("Skipped API keys.");
  });
}
