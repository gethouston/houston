import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAdminSection } from "./support/settings-nav";
import {
  agentSectionTab,
  expectTeamSections,
  openAgentScreen,
  openAgentSettings,
} from "./support/team-nav";
import { workspaceMenuTrigger } from "./support/workspace-menu";

const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

const MEMBER_CAPS = { multiplayer: true, teams: true, role: "user" };

const ROSTER = [
  { userId: "u-self", email: "you@acme.test", role: "owner" },
  { userId: "u-bob", email: "bob@acme.test", role: "user" },
];

const AGENTS = [
  {
    id: "agent-finance",
    name: "Finance Bot",
    assignments: [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ],
  },
];

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armOrg(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: ROSTER, agents: AGENTS },
  });
}

async function openFinance(page: Page): Promise<void> {
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", "People");
}

test("the team's agent list drills into seven settings lozenges", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", "Integrations");
  await expect(
    page.locator('[data-agent-section-body="integrations"]'),
  ).toBeVisible();
  await openAgentSettings(page, "Finance Bot", null);

  await expect(page.getByRole("tab", { name: "People" })).toHaveCount(0);
  for (const section of [
    "Job description",
    "Skills",
    "Learnings",
    "People",
    "Integrations",
    "AI Models",
    "Settings",
  ] as const) {
    await expect(agentSectionTab(page, section)).toBeVisible();
  }
  await expect(
    page.locator('[data-agent-section-body="manage"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Duplicate Finance Bot/ }),
  ).toBeVisible();
});

test("Duplicate opens pre-named with the first free name and refuses a taken one", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", null);
  await page.getByRole("button", { name: /Duplicate Finance Bot/ }).click();

  const nameField = page.locator("#agent-copy-name");
  await expect(nameField).toHaveValue("Finance Bot copy");
  await expect(
    page.getByRole("button", { name: "Create duplicate" }),
  ).toBeEnabled();

  await nameField.fill("Finance Bot");
  await expect(
    page.getByText("An AI Employee named Finance Bot already exists"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create duplicate" }),
  ).toBeDisabled();
});

test("People section: every member has a row, and a Can use -> No access change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  await expect(page.getByText("you@acme.test")).toBeVisible();
  const bob = page.getByRole("button", {
    name: "Change access for bob@acme.test",
  });
  await expect(bob).toContainText("Can use");

  await bob.click();
  await page.getByRole("menuitem", { name: /No access/ }).click();
  await expect(bob).toContainText("No access");

  await openFinance(page);
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("No access");
});

test("People section: the team-wide access choice writes the everyone sentinel", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  await expect(
    page.getByRole("radio", { name: "Only specific people" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "Everyone on your team" }).click();
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("there is nothing to set person by person"),
  ).toBeVisible();

  await openFinance(page);
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  await page.getByRole("radio", { name: "Only specific people" }).click();
  await expect(
    page.getByRole("heading", { name: "Switch to specific people?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, pick people" }).click();
  await expect(
    page.getByRole("radio", { name: "Only specific people" }),
  ).toBeChecked();
  await openFinance(page);
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("Can use");
});

test("People section: switching to everyone is confirm-gated when it drops a Manager", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        ...ROSTER,
        { userId: "u-cara", email: "cara@acme.test", role: "admin" },
      ],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          assignments: [
            { userId: "u-self", access: "manager" },
            { userId: "u-cara", access: "manager" },
          ],
        },
      ],
    },
  });
  await openFinance(page);

  await page.getByRole("radio", { name: "Everyone on your team" }).click();
  await expect(
    page.getByRole("heading", { name: "Give everyone access?" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Yes, give everyone access" }).click();
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  await openFinance(page);
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();
  await expect(
    page.getByRole("listitem").filter({ hasText: "cara@acme.test" }),
  ).toContainText("Can use");
});

test("a visible-but-not-manager admin is offered no settings door at all", async ({
  page,
  request,
}) => {
  await armCapabilities(request, {
    multiplayer: true,
    teams: true,
    role: "admin",
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        { userId: "u-self", email: "you@acme.test", role: "admin" },
        { userId: "u-bob", email: "bob@acme.test", role: "user" },
      ],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          access: "user",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
      ],
    },
  });
  await page.goto("/");
  await openAgentScreen(page, "Finance Bot");

  await expectTeamSections(page, ["Tasks", "Routines", "Files"]);
  await expect(agentSectionTab(page, "People")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Allowed People" }),
  ).toHaveCount(0);
});

test("Apps section: the app ceiling narrows and persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await agentSectionTab(page, "Integrations").click();

  await expect(
    page.getByRole("heading", { name: "Allowed Integrations" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which integrations can this AI Employee use?"),
  ).toBeVisible();

  await expect(
    page.getByRole("radio", { name: "Allow all integrations" }),
  ).toBeChecked();

  await page.getByRole("radio", { name: "Only integrations you pick" }).click();
  await expect(
    page.getByRole("radio", { name: "Only integrations you pick" }),
  ).toBeChecked();

  await openFinance(page);
  await agentSectionTab(page, "Integrations").click();
  await expect(
    page.getByRole("radio", { name: "Only integrations you pick" }),
  ).toBeChecked();
});

test("AI models section: the model ceiling editor is present", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await agentSectionTab(page, "AI Models").click();

  await expect(
    page.getByRole("heading", { name: "Allowed AI Models" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which AI models can this AI Employee use?"),
  ).toBeVisible();
});

test("Job description and Memory live on the same drilled page", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  await agentSectionTab(page, "Job description").click();
  await expect(agentSectionTab(page, "Job description")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await agentSectionTab(page, "Learnings").click();
  await expect(agentSectionTab(page, "Learnings")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a plain member cannot reach the agent settings page at all", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          access: "user",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
      ],
    },
  });
  await page.goto("/");
  await expect(workspaceMenuTrigger(page)).toBeVisible();

  await expectTeamSections(page, ["Tasks", "Routines", "Files"]);
});

test("Admin People roster shows a member's gateway display name, email as a secondary line", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        { userId: "u-self", email: "you@acme.test", role: "owner" },
        {
          userId: "u-bob",
          email: "bob@acme.test",
          role: "user",
          displayName: "Bob Q. Public",
        },
      ],
    },
  });

  await page.goto("/");
  await openAdminSection(page, "People");

  await expect(page.getByText("Bob Q. Public")).toBeVisible();
  await expect(page.getByText("bob@acme.test")).toBeVisible();
  await expect(page.getByText("you@acme.test")).toBeVisible();
});
