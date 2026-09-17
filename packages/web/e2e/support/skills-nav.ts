import { expect, type Page } from "@playwright/test";
import { openAgentSettings, screen } from "./team-nav";

/**
 * The prologues every per-agent skills spec opens with.
 *
 * The agent's Skills section has ONE discovery tab, so the catalog shell draws
 * no tablist at all: the section IS the custom-skills list. Every spec that
 * reached it through a "Custom skills" tab was really asking for the section,
 * which is what these helpers say instead — one place to re-point if the
 * surface's anchor ever moves again.
 */

/** The seeded agent every skills spec works against. */
const DEFAULT_AGENT = "Houston";

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
 * Install the fake host's canned dozen onto an agent through the real GitHub
 * flow — the shortest path to a skill that exists on an agent AND in the
 * shared library, which is the state the editor and dialog specs assert on.
 *
 * Leaves the Add dialog closed and the agent's Skills section on screen.
 */
export async function installRepoSkills(
  page: Page,
  agentName: string = DEFAULT_AGENT,
): Promise<void> {
  await openAgentSkills(page, agentName);
  await page.getByRole("button", { name: "Add skill" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("button", { name: "GitHub" }).click();
  await addDialog.getByPlaceholder("owner/repo").fill("mattpocock/skills");
  await addDialog.getByRole("button", { name: "Find skills" }).click();
  await expect(addDialog.getByText("12 skills found")).toBeVisible();
  await addDialog.getByRole("button", { name: "Install 12" }).click();
  await expect(addDialog.getByText(/Installed 12 skills/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(addDialog).toHaveCount(0);
}
