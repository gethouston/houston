import { ASSISTANT_AGENT_ID, FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { ASSISTANT_COMPOSER, ASSISTANT_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { assistantRow, openAssistant } from "./support/settings-nav";
import { openTeamSection, screen } from "./support/team-nav";
import { workspaceMenuTrigger } from "./support/workspace-menu";

function fulfillDiscovery(
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Retry-After",
      ...extra,
    },
    body: JSON.stringify(body),
  };
}

const userRow = (page: Page, text: string): Locator =>
  screen(page)
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

async function activityTitles(): Promise<string[]> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  const titles: string[] = [];
  for (const id of [ASSISTANT_AGENT_ID, ...agents.map((agent) => agent.id)]) {
    const { items } = (await (
      await fetch(
        `${FAKE_HOST_URL}/agents/${encodeURIComponent(id)}/activities`,
      )
    ).json()) as { items: { title: string }[] };
    titles.push(...items.map((a) => a.title));
  }
  return titles;
}

test.use({ teamBoard: true });

test("opens from the rail onto a welcoming empty chat", async ({ page }) => {
  await page.goto("/");
  await openAssistant(page);

  await expect(
    screen(page).getByText("Hi, I'm Houston, your AI Manager"),
  ).toBeVisible();
  await expect(
    screen(page).getByText(/ask before anything risky/),
  ).toBeVisible();

  await expect(
    screen(page).getByPlaceholder(ASSISTANT_PLACEHOLDER),
  ).toBeVisible();
});

test("holds a conversation that never becomes a board card", async ({
  page,
}) => {
  await page.goto("/");
  const before = await activityTitles();

  await openAssistant(page);
  const composer = screen(page).getByPlaceholder(ASSISTANT_COMPOSER);
  await composer.fill("what can you do");
  await composer.press("Enter");

  await expect(userRow(page, "what can you do")).toBeVisible();
  await expect(screen(page).getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  expect(await activityTitles()).toEqual(before);
  await openTeamSection(page, "Tasks");
  await expect(
    screen(page).getByText("what can you do", { exact: true }),
  ).toHaveCount(0);
});

test("the composer menu offers the conversation commands once there is a chat", async ({
  page,
}) => {
  await page.goto("/");
  await openAssistant(page);

  await screen(page).getByRole("button", { name: "Attach" }).click();
  await expect(
    page.getByRole("button", { name: "Clear context" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  const composer = screen(page).getByPlaceholder(ASSISTANT_COMPOSER);
  await composer.fill("hello");
  await composer.press("Enter");
  await expect(screen(page).getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  await screen(page).getByRole("button", { name: "Attach" }).click();
  await expect(
    page.getByRole("button", { name: "Compact context" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Clear context" }),
  ).toBeEnabled();
});

test("the row is absent where the deployment serves no assistant", async ({
  page,
}) => {
  await page.route("**/v1/assistant", (route) =>
    route.fulfill(
      fulfillDiscovery(501, {
        error: "the gateway serves assistant discovery, not this engine",
        code: "assistant_gateway_only",
      }),
    ),
  );
  await page.goto("/");

  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await expect(assistantRow(page)).toHaveCount(0);
});

test("says so, and offers another ask, when the manager will not start", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/v1/assistant", (route) => {
    requests += 1;
    return route.fulfill(
      fulfillDiscovery(
        503,
        { error: "engine unavailable" },
        {
          "Retry-After": "1",
        },
      ),
    );
  });
  test.slow();

  await page.goto("/");
  await assistantRow(page).click();

  await expect(screen(page).getByText("Houston isn't responding")).toBeVisible({
    timeout: 30_000,
  });

  const asked = requests;
  await screen(page).getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => requests, { timeout: 10_000 }).toBeGreaterThan(asked);
});
