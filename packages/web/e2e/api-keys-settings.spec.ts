import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { openAgentSettings } from "./support/agent-nav";
import { ASSISTANT_COMPOSER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openAssistant, openSettings } from "./support/settings-nav";

const PERSONAL_SLUG = "fedcba9876543210";
const SECRET = `hst_${"9f2c1a7b4e8d0364".repeat(4)}`;

async function mockGateway(page: Page) {
  const keys = [
    {
      id: "key-1",
      name: "Zapier",
      prefix: "hst_9f2c",
      createdAt: "2026-09-08T12:00:00Z",
    },
  ];
  await page.route("**/v1/keys**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const { name } = request.postDataJSON() as { name: string };
      const created = {
        id: "key-2",
        name,
        prefix: "hst_aaaa",
        createdAt: "2026-10-05T12:00:00Z",
      };
      keys.unshift(created);
      return route.fulfill({ status: 201, json: { ...created, key: SECRET } });
    }
    return route.fulfill({ json: { keys } });
  });
  await page.route("**/v1/orgs", (route) =>
    route.fulfill({
      json: {
        orgs: [
          {
            id: "org-personal",
            slug: PERSONAL_SLUG,
            name: "Personal",
            kind: "personal",
            role: "owner",
            memberCount: 1,
            degraded: false,
          },
        ],
        invites: [],
      },
    }),
  );
}

test("Settings lists API keys only where the public API is served", async ({
  page,
}) => {
  const capabilities = page.waitForResponse("**/v1/capabilities");
  await page.goto("/");
  await capabilities;
  await openSettings(page);
  await expect(page.getByRole("button", { name: /^API keys/ })).toHaveCount(0);
});

test("API keys shows the organization ID, mints a key once, and links the docs", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { apiKeys: true },
  });
  await mockGateway(page);
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: /^API keys/ }).click();
  await expect(
    page.getByRole("heading", { name: "API keys", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(PERSONAL_SLUG, { exact: true })).toBeVisible();
  await expect(page.getByText("Zapier", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("My script");
  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(dialog.getByText(SECRET, { exact: true })).toBeVisible();
  await expect(
    dialog.locator("pre").filter({ hasText: `Bearer ${SECRET}` }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("My script", { exact: true })).toBeVisible();

  const docs = page.getByRole("button", { name: "Read the developer docs" });
  await expect(docs).toBeVisible();
  const popup = page.waitForEvent("popup");
  await docs.click();
  expect((await popup).url()).toContain("gethouston.ai/developers");

  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText(PERSONAL_SLUG, { exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Copy" })).toBeInViewport();
});

test("an AI Employee's API access opens from its Settings and leads to the keys", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { apiKeys: true },
  });
  await mockGateway(page);
  await page.goto("/");
  await openAgentSettings(page, SEED_AGENT_NAME, null);
  await page.getByRole("button", { name: /^API access/ }).click();
  await expect(
    page.getByRole("heading", { name: "API access", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Agent ID", { exact: true })).toBeVisible();
  await expect(page.getByText(PERSONAL_SLUG, { exact: true })).toBeVisible();
  await expect(
    page
      .locator("pre")
      .filter({ hasText: `x-houston-org: ${PERSONAL_SLUG}` })
      .filter({ hasText: "$HOUSTON_API_KEY" }),
  ).toBeVisible();

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  let minted = false;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/v1/keys"))
      minted = true;
  });
  await page.getByRole("button", { name: "Copy prompt for AI agent" }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`x-houston-org: ${PERSONAL_SLUG}`);
  expect(prompt).toContain("HOUSTON_API_KEY");
  expect(prompt).not.toMatch(/hst_[0-9a-f]/);
  expect(minted).toBe(false);

  await page
    .locator("[data-agent-section-body='manage']")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByText("Change color & name")).toBeVisible();
  await page.getByRole("button", { name: /^API access/ }).click();
  await page.getByRole("button", { name: /^API keys/ }).click();
  await expect(
    page.getByRole("heading", { name: "API keys", exact: true }),
  ).toBeVisible();
});

test("an AI Employee's Settings has no API access without the public API", async ({
  page,
}) => {
  const capabilities = page.waitForResponse("**/v1/capabilities");
  await page.goto("/");
  await capabilities;
  await openAgentSettings(page, SEED_AGENT_NAME, null);
  await expect(page.getByText("Change color & name")).toBeVisible();
  await expect(page.getByRole("button", { name: /^API access/ })).toHaveCount(
    0,
  );
});

test("the AI Manager's API access card shows that employee's details in the chat", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { apiKeys: true },
  });
  await mockGateway(page);
  const reason = "Copy the prompt for your coding tool.";
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "hands_on",
            id: "h1",
            surface: "agentApiAccess",
            agentId: SEED_AGENT_ID,
            reason,
          },
        ],
      },
    },
  });
  await page.goto("/");
  await openAssistant(page);
  const composer = page.getByPlaceholder(ASSISTANT_COMPOSER);
  await composer.fill(`Connect ${SEED_AGENT_NAME} to my app`);
  await composer.press("Enter");
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  const url = page.url();

  await expect(
    page.getByText(`API access for ${SEED_AGENT_NAME}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(SEED_AGENT_ID, { exact: true })).toBeVisible();
  await expect(page.getByText(PERSONAL_SLUG, { exact: true })).toBeVisible();

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy prompt for AI agent" }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`x-houston-org: ${PERSONAL_SLUG}`);
  expect(prompt).toContain("HOUSTON_API_KEY");
  expect(prompt).toContain(SEED_AGENT_ID);
  expect(prompt).not.toMatch(/hst_[0-9a-f]/);
  expect(page.url()).toBe(url);
  await expect(page.getByText(reason, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(composer).toBeVisible({ timeout: 15_000 });
});
