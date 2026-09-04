import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

/**
 * The create dialog's "Copy an agent" door, shared by the desktop and phone
 * specs: the same wizard renders on both breakpoints, only the control that
 * opens the dialog differs (the rail's row vs the Agents home title row).
 */

/** Content the seeded agent gets so every wizard screen has something to show. */
export const COPY_SOURCE = {
  instructions: "You are the ops assistant. Keep answers short.",
  routine: { name: "Daily digest", prompt: "Summarize yesterday's tickets." },
  skill: { name: "invoice-triage", description: "Sort incoming invoices." },
  // From the fake host's seeded Memory tab.
  learnings: [
    "Exclude churned accounts from pipeline math.",
    "Prefers metric units in every report.",
  ],
};

/** Give the seeded agent a job description, one routine and one skill. */
export async function seedCopySource(
  request: APIRequestContext,
): Promise<{ routineId: string }> {
  const base = `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}`;
  await request.put(`${base}/agentfile/CLAUDE.md`, {
    data: { content: COPY_SOURCE.instructions },
  });
  const routine = await request.post(`${base}/routines`, {
    data: COPY_SOURCE.routine,
  });
  const { id } = (await routine.json()) as { id: string };
  await request.post(`${base}/skills`, {
    data: { ...COPY_SOURCE.skill, content: "# Invoice triage" },
  });
  return { routineId: id };
}

/** The selection the last export carried, as the fake host recorded it. */
export async function lastCopySelection(request: APIRequestContext): Promise<{
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
} | null> {
  const res = await request.get(`${FAKE_HOST_URL}/__test__/portable-export`);
  return ((await res.json()) as { selection: never }).selection;
}

export function createDialog(page: Page): Locator {
  return page.getByRole("dialog");
}

/** From the open create dialog, walk into the copy wizard's source list. */
export async function openCopyWizard(page: Page): Promise<void> {
  const tile = createDialog(page).getByRole("button", {
    name: "Copy an agent",
    exact: true,
  });
  await tile.waitFor({ state: "visible" });
  await tile.click();
  await expect(page.getByTestId("copy-agent-sources")).toBeVisible();
}

/** The switch for one row, by the row's title (the switch's accessible name). */
export function rowSwitch(page: Page, title: string): Locator {
  return createDialog(page).getByRole("switch", { name: title });
}

export async function next(page: Page): Promise<void> {
  await createDialog(page)
    .getByRole("button", { name: "Continue", exact: true })
    .click();
}
