import type { LegacyDetection, MigrationTask } from "./cloud-migration";
import {
  type AgentMigrationProgress,
  initialProgress,
} from "./cloud-migration-progress";

function demoFlag(): string | null {
  try {
    if (!import.meta.env.DEV) return null;
    const env = import.meta.env.VITE_MIGRATION_DEMO;
    if (env === "1" || env === "hold") return env;
    return typeof localStorage !== "undefined"
      ? localStorage.getItem("houston.cloudMigration.demo")
      : null;
  } catch {
    return null;
  }
}

export function isMigrationDemo(): boolean {
  const flag = demoFlag();
  return flag === "1" || flag === "hold";
}

export const DEMO_DETECTION: LegacyDetection = {
  hasWorkspaces: true,
  hasChatDb: true,
  workspaceDirs: ["Personal", "Work"],
  agentDirCount: 3,
};

const manifest = (totalBytes: number, integrations: string[]) => ({
  entries: [],
  excluded: [],
  integrations,
  totalBytes,
});

const task = (
  workspace: string,
  agent: string,
  bytes: number,
  integrations: string[],
): MigrationTask => ({
  sourceId: `${workspace}/${agent}`,
  workspace,
  agent,
  targetName: agent,
  alreadyDone: false,
  manifest: manifest(bytes, integrations),
});

export const DEMO_TASKS: MigrationTask[] = [
  task("Personal", "Personal Assistant", 2_400_000, [
    "gmail",
    "googlecalendar",
  ]),
  task("Personal", "Inbox Helper", 900_000, ["gmail", "slack"]),
  task("Work", "Trip Planner", 1_500_000, ["googlecalendar"]),
];

export const DEMO_INTEGRATIONS = ["gmail", "googlecalendar", "slack"];

export async function runDemoMigration(
  set: (
    fn: (s: {
      progress: Record<string, AgentMigrationProgress>;
    }) => Record<string, unknown>,
  ) => void,
): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const patch = (id: string, p: Partial<AgentMigrationProgress>) =>
    set((s) => ({
      progress: { ...s.progress, [id]: { ...s.progress[id], ...p } },
    }));

  set(() => ({
    screen: "progress",
    preparing: true,
    backingUp: true,
    startError: null,
    tasks: DEMO_TASKS,
    progress: Object.fromEntries(
      DEMO_TASKS.map((t) => [t.sourceId, initialProgress(t)]),
    ),
    integrations: DEMO_INTEGRATIONS,
  }));
  await sleep(600);
  set(() => ({ backingUp: false }));
  await sleep(750);
  set(() => ({ preparing: false }));

  for (const [i, t] of DEMO_TASKS.entries()) {
    patch(t.sourceId, { step: "creating" });
    await sleep(500);
    patch(t.sourceId, { step: "warming" });
    await sleep(650);
    patch(t.sourceId, { step: "uploading", chunkIndex: 1, chunkCount: 3 });
    await sleep(500);
    if (i === 1 && demoFlag() === "hold") return;
    patch(t.sourceId, { chunkIndex: 2 });
    await sleep(500);
    patch(t.sourceId, { chunkIndex: 3 });
    await sleep(400);
    patch(t.sourceId, { step: "finalizing" });
    await sleep(400);
    patch(t.sourceId, { step: "done" });
    await sleep(250);
  }
  set(() => ({ screen: "done" }));
}
