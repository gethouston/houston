import { FAKE_HOST_URL, SEED_AGENT_NAME } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armIntegrationsMode(
  request: APIRequestContext,
  mode: "ready" | "unavailable" | "signin" | "absent",
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/integrations-mode`, {
    data: { mode },
  });
}

async function armCustomIntegrations(
  request: APIRequestContext,
  items: unknown[] | null,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
    data: { items },
  });
}

async function openCustomIntegrations(page: Page): Promise<void> {
  await page.goto("/");
  await openNavRow(page, "integrations");
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
}

async function startSetupChat(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add custom integration" }).click();
}

test("composio-absent: Add custom integration opens the embedded chat, agent speaks first, no view switch", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["custom"] });
  await armIntegrationsMode(request, "absent");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page);

  await startSetupChat(page);

  await expect(page.getByText("Task: Set up a custom integration")).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
});

test("a multi-agent workspace interposes ONLY the agent picker before the chat", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["custom"] });
  await armIntegrationsMode(request, "absent");
  await armCustomIntegrations(request, []);
  await request.post(`${FAKE_HOST_URL}/agents`, { data: { name: "Atlas" } });
  await openCustomIntegrations(page);

  await page.getByRole("button", { name: "Add custom integration" }).click();
  await expect(
    page.getByText("Which AI Employee should run this?"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: SEED_AGENT_NAME })
    .click();
  await expect(page.getByText("Task: Set up a custom integration")).toBeVisible(
    { timeout: 10_000 },
  );
});

test("a draft chat survives a reload as a Continue banner that resumes the same chat", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page);

  await startSetupChat(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await openNavRow(page, "integrations");
  await expect(
    page.getByText("You are setting up a custom integration in chat"),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Task: Set up a custom integration")).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(page.getByText(/Roger that\./).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("the interview surface renders: an ask_user question card replaces the composer", async ({
  page,
  request,
}) => {
  test.slow();
  await fetch(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which service do you want to connect?",
            options: [
              { id: "acme", label: "Acme CRM" },
              { id: "other", label: "Something else" },
            ],
          },
        ],
      },
    }),
  });

  await armCapabilities(request, { integrations: ["custom"] });
  await armIntegrationsMode(request, "absent");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page);

  await startSetupChat(page);
  await expect(page.getByText("Task: Set up a custom integration")).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByText("Which service do you want to connect?"),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).not.toBeVisible();
  await expect(page.getByPlaceholder("Type another option...")).toBeVisible();
});

test("Done retires the chat: no banner, and the next Add starts a FRESH chat", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page);

  await startSetupChat(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Task: Set up a custom integration"),
  ).not.toBeVisible();
  await expect(
    page.getByText("You are setting up a custom integration in chat"),
  ).not.toBeVisible();

  await startSetupChat(page);
  await expect(page.getByText("Task: Set up a custom integration")).toBeVisible(
    { timeout: 10_000 },
  );
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  const activities = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agents[0].id}/activities`)
  ).json()) as { items: { id: string; agent?: string; status: string }[] };
  const setups = activities.items.filter(
    (a) => a.agent === "houston:integration-setup",
  );
  expect(setups).toHaveLength(2);
  expect(setups.filter((a) => a.status === "archived")).toHaveLength(1);
  expect(setups[0].id).not.toBe(setups[1].id);
});
