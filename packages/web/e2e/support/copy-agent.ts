import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

export const COPY_SOURCE = {
  instructions: "You are the ops assistant. Keep answers short.",
  routine: { name: "Daily digest", prompt: "Summarize yesterday's tickets." },
  skill: { name: "invoice-triage", description: "Sort incoming invoices." },
  learnings: [
    "Exclude churned accounts from pipeline math.",
    "Prefers metric units in every report.",
  ],
};

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

export function copyCard(page: Page): Locator {
  return createDialog(page).getByRole("button", {
    name: "Copy an existing AI Employee",
  });
}

export async function openCopyWizard(page: Page): Promise<void> {
  const card = copyCard(page);
  await card.waitFor({ state: "visible" });
  await card.click();
  await expect(page.getByTestId("copy-agent-sources")).toBeVisible();
}

export function rowSwitch(page: Page, title: string): Locator {
  return createDialog(page).getByRole("switch", { name: title });
}

export async function next(page: Page): Promise<void> {
  await createDialog(page)
    .getByRole("button", { name: "Continue", exact: true })
    .click();
}
