import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { openAgentSettings, screen } from "./team-nav";

const DEFAULT_AGENT = SEED_AGENT_NAME;

export const SEEDED_SKILLS = [
  {
    slug: "invoice-triage",
    title: "Invoice triage",
    description: "Sort incoming invoices.",
  },
  {
    slug: "meeting-notes",
    title: "Meeting notes",
    description: "Write up what was decided.",
  },
] as const;

export async function openAgentSkills(
  page: Page,
  agentName: string = DEFAULT_AGENT,
): Promise<void> {
  await openAgentSettings(page, agentName, "Skills");
  await expect(
    screen(page).getByRole("searchbox", { name: "Search skills" }),
  ).toBeVisible();
}

export async function seedAgentSkills(
  request: APIRequestContext,
): Promise<void> {
  for (const skill of SEEDED_SKILLS) {
    const res = await request.post(
      `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/skills`,
      {
        data: {
          name: skill.slug,
          description: skill.description,
          content: `# ${skill.title}\n`,
        },
      },
    );
    expect(res.status()).toBe(201);
  }
}

export async function seedWorkspaceSkill(
  request: APIRequestContext,
  skill: { name: string; title: string; description: string },
): Promise<void> {
  const res = await request.post(
    `${FAKE_HOST_URL}/v1/workspaces/default/shared-skills`,
    {
      data: {
        name: skill.name,
        description: skill.description,
        content: `---\nname: ${skill.name}\ntitle: "${skill.title}"\ndescription: "${skill.description}"\n---\n# Steps\n`,
      },
    },
  );
  expect(res.status()).toBe(201);
}
