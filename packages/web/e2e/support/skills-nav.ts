import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { openAgentSettings, screen } from "./team-nav";

/**
 * The prologues every per-agent skills spec opens with.
 *
 * An AI Employee's Skills section IS the workspace Skills surface scoped to
 * that employee: one list of what it has, the same search, and its own
 * "Create skill" menu. There is no discovery tab and no tile strip, so these
 * helpers name the section itself — one place to re-point if its anchor ever
 * moves again.
 */

/** The seeded agent every skills spec works against. */
const DEFAULT_AGENT = "Houston";

/** One skill as a spec seeds it: the slug the host stores it under, and the
 *  title the surfaces display (the humanized slug, since nothing writes a
 *  frontmatter `title:` until the rename pencil does). */
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

/**
 * Open one agent's Skills section, landed.
 *
 * The wait is the catalog's own search field: the section's header lozenge
 * lights up on click, so only a control from the BODY proves the skills
 * surface itself swapped in before a spec's first assertion runs.
 */
export async function openAgentSkills(
  page: Page,
  agentName: string = DEFAULT_AGENT,
): Promise<void> {
  await openAgentSettings(page, agentName, "Skills");
  await expect(
    screen(page).getByRole("searchbox", { name: "Search skills" }),
  ).toBeVisible();
}

/**
 * Put {@link SEEDED_SKILLS} on the seeded agent through the host's own skill
 * create route, server to server — the shortest path to an employee that HAS
 * skills, which is the state the editor specs assert on.
 *
 * The content carries no Houston workflow marker, so the editor's Workflow
 * view shows its empty state and the Text view is the file itself.
 *
 * Call it before `page.goto("/")`: the list is read once and refreshed by
 * host events, so seeding first spares every spec a reload.
 */
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

/** Seed a skill into the WORKSPACE store, which no employee loads yet — what
 *  "Add an existing skill" offers. */
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
