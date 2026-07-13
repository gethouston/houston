import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The custom-integration setup chat is embedded INSIDE the Integrations page
 * (not a board mission): "Add custom integration" picks an agent, then opens a
 * guided setup chat right there — the agent speaks first (the Houston-sent
 * kickoff bubble never renders), the chat never appears as a board card, and
 * the page never navigates away. The load-bearing case is the COMPOSIO-ABSENT
 * host (no key, no gateway): the chat must work there too.
 */

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

/**
 * Navigate to the Integrations page and land on the custom-integrations
 * surface: the standalone section on a composio-absent host (its heading
 * proves it rendered), else the Custom integrations tab of the ready page.
 */
async function openCustomIntegrations(
  page: Page,
  mode: "absent" | "ready",
): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
  if (mode === "ready") {
    await page.getByRole("tab", { name: "Custom integrations" }).click();
  } else {
    await expect(
      page.getByRole("heading", { name: "Custom integrations" }),
    ).toBeVisible();
  }
}

async function startSetupChat(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add custom integration" }).click();
  // The agent picker: choose the seeded agent to open the embedded chat.
  await expect(page.getByText("Which agent should run this?")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Houston" })
    .click();
}

test("composio-absent: Add custom integration opens the embedded chat, agent speaks first, no view switch", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["custom"] });
  await armIntegrationsMode(request, "absent");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page, "absent");

  await startSetupChat(page);

  // The embedded setup-chat panel opens with the integration mission title…
  await expect(
    page.getByText("Mission: Set up a custom integration"),
  ).toBeVisible({ timeout: 10_000 });
  // …and the agent's reply is the FIRST message — the user typed nothing (the
  // fake host's canned reply echoes the kickoff, so "no kickoff bubble" is
  // covered by the unit test on filterAutoContinueFeedItems, not by text here).
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // No board navigation: still on the Integrations page next to the chat.
  await expect(
    page.getByRole("heading", { name: "Custom integrations" }),
  ).toBeVisible();
});

test("a draft chat survives a reload as a Continue banner that resumes the same chat", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page, "ready");

  await startSetupChat(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // Come back later: the ephemeral open flag is gone, but the draft on the
  // host is not — the cross-agent scan finds it and offers to continue.
  await page.reload();
  await page.locator('[data-tour-target="nav-integrations"]').click();
  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await expect(
    page.getByText("You are setting up a custom integration in chat"),
  ).toBeVisible({ timeout: 10_000 });

  // Continue reopens the SAME chat (no duplicate mission), with its history.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Mission: Set up a custom integration"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Roger that\./).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("the interview surface renders: an ask_user question card replaces the composer", async ({
  page,
  request,
}) => {
  // Settle-dependent (rides the DONE frame): triple the budget for a CI drop.
  test.slow();
  // Arm the turn to settle on an ask_user interaction — the interview state.
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
  await openCustomIntegrations(page, "absent");

  await startSetupChat(page);
  await expect(
    page.getByText("Mission: Set up a custom integration"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // The ask_user card shows once the turn settles — proof the setup panel
  // forwards composerOverride (the same channel the request_credential card
  // uses). The real composer stays mounted below it.
  await expect(
    page.getByText("Which service do you want to connect?"),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

test("Done retires the chat: no banner, and the next Add starts a FRESH chat", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openCustomIntegrations(page, "ready");

  await startSetupChat(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // The user says the integration works: Done retires the draft on the spot.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Mission: Set up a custom integration"),
  ).not.toBeVisible();
  await expect(
    page.getByText("You are setting up a custom integration in chat"),
  ).not.toBeVisible();

  // A finished setup never resumes: the next Add opens a brand-new chat. The
  // fake host answers every kickoff with the same canned reply, so freshness
  // is asserted on the HOST's state: two distinct setup missions now exist,
  // and only the first is archived.
  await startSetupChat(page);
  await expect(
    page.getByText("Mission: Set up a custom integration"),
  ).toBeVisible({ timeout: 10_000 });
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
