import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { adminRow } from "./support/settings-nav";
import { openAgentSettings } from "./support/team-nav";
import {
  openNavRow,
  openWorkspaceMenu,
  railDestination,
  workspaceMenuTrigger,
} from "./support/workspace-menu";

const OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  role: "owner",
};

const SPACES_CAPS = { multiplayer: true, teams: true, spaces: true };

const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armTeamWorkspace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/workspaces`, {
    data: { teams: [TEAM] },
  });
}

const settlesShell = (page: Page) =>
  expect(workspaceMenuTrigger(page)).toBeVisible();

async function switchToTeam(page: Page): Promise<void> {
  await workspaceMenuTrigger(page).click();
  await page.getByRole("menuitemcheckbox", { name: TEAM.name }).click();
}

async function openHub(page: Page): Promise<void> {
  await openNavRow(page, "ai-hub");
}

test("Teams owner: the AI hub has AI Providers and AI Models lozenges", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await page.goto("/");
  await openNavRow(page, "ai-hub");

  const headerNav = page.getByRole("navigation", {
    name: "AI providers and models",
  });
  await expect(
    headerNav.getByRole("button", { name: "AI Providers", exact: true }),
  ).toBeVisible();
  const allModels = headerNav.getByRole("button", {
    name: "AI Models",
    exact: true,
  });
  await expect(allModels).toBeVisible();
  await expect(page.getByRole("heading", { name: "Available" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Connect / }).first(),
  ).toBeVisible();
  const search = page.getByPlaceholder("Search AI models and providers");
  await search.fill("claude");
  await allModels.click();
  await expect(search).toHaveValue("claude");
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Good at" })).toBeVisible();
});

test("Teams member: the AI Models nav is there, and no usage screen is", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);

  await expect(railDestination(page, "nav-ai-hub")).toBeVisible();
  await expect(railDestination(page, "nav-integrations")).toBeVisible();
  await openWorkspaceMenu(page);
  await expect(page.locator('[data-tour-target="nav-usage"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Teams member in a team space: the hub is theirs, and says so", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect OpenAI" }),
  ).toBeVisible();
});

test("Teams owner in a team space: the same one surface, no account choice", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_CAPS, role: "owner" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Team account" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
});

test("personal space: the hub renders NO account note at all", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_CAPS, role: "owner" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await openHub(page);

  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Available" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "AI providers and models" })
      .getByRole("button", { name: "AI Models", exact: true }),
  ).toBeVisible();
});

test("a per-agent model ceiling offers the full catalog (no org narrowing)", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [{ userId: "u-self", email: "you@acme.test", role: "owner" }],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          assignments: [{ userId: "u-self", access: "manager" }],
        },
      ],
    },
  });
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", "AI Models");

  await expect(
    page.getByRole("heading", { name: "Allowed AI Models" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which AI models can this AI Employee use?"),
  ).toBeVisible();

  await page.getByRole("radio", { name: "Only models you pick" }).click();
  await expect(page.getByRole("heading", { name: "Add models" })).toBeVisible();
  await expect(page.getByText(/Opus/i).first()).toBeVisible();
  await expect(page.getByText(/Sonnet/i).first()).toBeVisible();
});

test("account usage renders on the hub's Connected row and nowhere else", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/provider-usage`, {
    data: {
      rows: [{ provider: "anthropic", status: "unauthenticated", windows: [] }],
    },
  });
  await page.goto("/");
  await openNavRow(page, "ai-hub");

  await expect(
    page.getByText("Sign in again to see this account's usage."),
  ).toBeVisible();

  await expect(
    page
      .locator("[data-tour-target='sidebar']")
      .getByRole("button", { name: "Time worked", exact: true }),
  ).toHaveCount(0);
  await expect(await adminRow(page)).toBeVisible();
});

test("a team-space member's connect configures THEIR turns, with no scope on the wire", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);

  const credentialCalls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith(FAKE_HOST_URL)) return;
    if (/\/credential\/|\/auth\//.test(url)) credentialCalls.push(url);
  });

  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  await expect(page.getByRole("heading", { name: /^Connected/ })).toBeVisible();

  await page.getByRole("button", { name: "Connect OpenAI" }).click();

  const loginFired = () =>
    credentialCalls.some((url) => /\/auth\/[^/]+\/login/.test(url));
  await expect.poll(loginFired, { timeout: 15_000 }).toBe(true);
  for (const url of credentialCalls) {
    expect(url).not.toContain("scope=");
  }
});
