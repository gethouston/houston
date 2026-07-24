/**
 * Dev-only demo mode for the cloud-migration wizard (HOU-719).
 *
 * In `pnpm dev` the gate stays closed: the app runs against the local sidecar
 * (`remoteGateway` false) and the real run needs the source-host sidecar + the
 * cloud gateway, neither of which exists locally. This module forces the wizard
 * open with stub data and simulates the run FRONTEND-ONLY, so the whole flow
 * (offer → progress → done) can be clicked through on a dev machine.
 *
 * Toggle it from the running app's devtools console:
 *   localStorage.setItem("houston.cloudMigration.demo", "1"); location.reload();
 *   // "hold" instead of "1" parks the run mid-upload FOREVER — the progress
 *   // screen (and its wait game) stays up for design iteration:
 *   localStorage.setItem("houston.cloudMigration.demo", "hold"); location.reload();
 *   // turn off: localStorage.removeItem("houston.cloudMigration.demo")
 *
 * Guarded by `import.meta.env.DEV`, so the whole path is dead-code-eliminated
 * from production builds — it can never reach a shipped app.
 */

import type { LegacyDetection, MigrationTask } from "./cloud-migration";
import {
  type AgentMigrationProgress,
  initialProgress,
} from "./cloud-migration-progress";

function demoFlag(): string | null {
  try {
    if (!import.meta.env.DEV) return null;
    // `VITE_MIGRATION_DEMO=1|hold pnpm tauri dev` forces it on for the whole
    // launch (no console step needed); otherwise the per-tab localStorage flag.
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

/**
 * Simulate the whole migration run against the wizard store — no source host,
 * no gateway. Steps each stub agent through creating → warming → uploading →
 * finalizing → done on timers, then lands on the done screen.
 */
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
    // "hold": park the SECOND agent mid-upload forever (one done, one active,
    // one pending — a representative frame) so the progress screen + game can
    // be designed against without racing the timers.
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
