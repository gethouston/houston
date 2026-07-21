/**
 * Wizard driver state for the first-run cloud migration (HOU-719).
 *
 * Owns the screen (offer → progress → done), the task list, and per-agent
 * progress; runs the agents SEQUENTIALLY (one warm-up + upload at a time so a
 * big install doesn't stampede the gateway). Pure logic lives in
 * `lib/cloud-migration.ts`, the prepare phase in `lib/cloud-migration-prepare.ts`,
 * per-task I/O in `lib/cloud-migration-runner.ts`.
 *
 * Failures are never silent: a failed prepare parks in `startError` with a
 * retry, a failed agent parks in a per-row error state with a retry, and both
 * are reported to Sentry (`reportError`) so beta noise reaches us.
 */

import { create } from "zustand";
import { analytics } from "../lib/analytics";
import type { MigrationTask } from "../lib/cloud-migration";
import { isMigrationDemo, runDemoMigration } from "../lib/cloud-migration-demo";
import { prepareMigration } from "../lib/cloud-migration-prepare";
import {
  type AgentMigrationProgress,
  initialProgress,
} from "../lib/cloud-migration-progress";
import {
  MigrationStepError,
  runMigrationTask,
} from "../lib/cloud-migration-runner";
import type { SourceHostHandshake } from "../lib/cloud-migration-transport";
import { reportError } from "../lib/error-toast";
import {
  osBackupHoustonData,
  osStartMigrationSourceHost,
  osStopMigrationSourceHost,
} from "../lib/os-bridge";
import { useAgentStore } from "./agents";
import { finishRun } from "./cloud-migration-finish";
import { useWorkspaceStore } from "./workspaces";

export type CloudMigrationScreen = "offer" | "progress" | "done";

interface CloudMigrationState {
  screen: CloudMigrationScreen;
  /** Spawning the source host / scanning — can take minutes (chat db boot). */
  preparing: boolean;
  /** Copying `~/.houston` to a local backup before anything is touched. A
   *  subset of `preparing` (it stays true through the backup), branched on
   *  first so the wait screen shows the backup step, not the prepare text. */
  backingUp: boolean;
  /** Prepare failed (source host spawn / scan / resume probe). Retryable. */
  startError: string | null;
  tasks: MigrationTask[];
  progress: Record<string, AgentMigrationProgress>;
  /** Toolkit slugs the legacy agents had connected (done-screen checklist). */
  integrations: string[];
  /** Begin (or retry a failed prepare of) the whole migration. */
  start: () => Promise<void>;
  /** Re-run one failed agent from its first incomplete step. */
  retryTask: (sourceId: string) => Promise<void>;
  /** Leave remaining failures behind and move on to the done screen. */
  continueAnyway: () => void;
  /** True once the user bailed out of a running migration ("Migrate later").
   *  The run loop breaks after the current task; the source host is stopped. */
  deferred: boolean;
  /** Bail out of an in-progress migration (it was taking too long). Stops the
   *  source host and breaks the run loop; the migration stays resumable from
   *  Settings (already-migrated agents are skipped on the next run). */
  deferMigration: () => void;
}

let sourceHost: SourceHostHandshake | null = null;

type Setter = (
  fn: (s: CloudMigrationState) => Partial<CloudMigrationState>,
) => void;

function patchProgress(
  set: Setter,
  sourceId: string,
  patch: Partial<AgentMigrationProgress>,
) {
  set((s) => ({
    progress: {
      ...s.progress,
      [sourceId]: { ...s.progress[sourceId], ...patch },
    },
  }));
}

export const useCloudMigrationStore = create<CloudMigrationState>(
  (set, get) => {
    const runTask = async (task: MigrationTask, overwrite: boolean) => {
      try {
        // A v3 host always reports one synthetic workspace, and `start` set
        // the source host just above — but if either invariant ever breaks,
        // it parks the row in the retryable error state, never an unhandled
        // rejection out of the run loop.
        const workspaceId = useWorkspaceStore.getState().workspaces[0]?.id;
        if (!workspaceId || !sourceHost) {
          throw new Error("migration run started before its prerequisites");
        }
        await runMigrationTask(task, {
          workspaceId,
          source: sourceHost,
          getProgress: () => get().progress[task.sourceId],
          patchProgress: (patch) => patchProgress(set, task.sourceId, patch),
          overwrite,
        });
        analytics.track("cloud_migration_agent_done", {
          bytes: task.manifest.totalBytes,
        });
      } catch (err) {
        const step = err instanceof MigrationStepError ? err.step : "uploading";
        const message = err instanceof Error ? err.message : String(err);
        patchProgress(set, task.sourceId, {
          step: "error",
          errorStep: step,
          errorMessage: message,
        });
        analytics.track("cloud_migration_agent_failed", { step });
        reportError("cloud_migration_agent", message, err);
      }
    };

    // Shared tail (stop source host, refresh agents, analytics) lives in
    // `cloud-migration-finish.ts`; it flips the screen through this callback.
    const finish = () => finishRun(get, () => set(() => ({ screen: "done" })));

    const settleIfAllDone = async () => {
      const { tasks, progress } = get();
      if (!tasks.every((t) => progress[t.sourceId]?.step === "done")) return;
      await finish();
    };

    return {
      screen: "offer",
      preparing: false,
      backingUp: false,
      startError: null,
      tasks: [],
      progress: {},
      integrations: [],
      deferred: false,

      start: async () => {
        // Dev-only: simulate the run frontend-only (no source host / gateway).
        if (isMigrationDemo()) {
          await runDemoMigration(set);
          return;
        }
        analytics.track("cloud_migration_accepted");
        set(() => ({
          screen: "progress",
          preparing: true,
          backingUp: true,
          startError: null,
          deferred: false,
        }));
        // Never migrate without a local backup: copy `~/.houston` aside FIRST,
        // so a crash mid-upload can't lose the only copy of the user's data.
        try {
          const backup = await osBackupHoustonData();
          set(() => ({ backingUp: false }));
          analytics.track("cloud_migration_backup_done", {
            bytes: backup.byteCount,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set(() => ({
            preparing: false,
            backingUp: false,
            startError: message,
          }));
          analytics.track("cloud_migration_failed", { step: "backup" });
          reportError("cloud_migration_backup", message, err);
          return;
        }
        // Backup is safe on disk. Crash-recovery is server-side: the gateway
        // stamps a per-agent import marker as each agent lands, so a re-run from
        // Settings skips already-migrated agents (see buildMigrationPlan resume).
        let tasks: MigrationTask[];
        try {
          const prepared = await prepareMigration(
            useAgentStore.getState().agents,
          );
          sourceHost = prepared.source;
          tasks = prepared.tasks;
          set(() => ({
            preparing: false,
            tasks,
            progress: Object.fromEntries(
              tasks.map((t) => [t.sourceId, initialProgress(t)]),
            ),
            integrations: prepared.integrations,
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set(() => ({ preparing: false, startError: message }));
          analytics.track("cloud_migration_failed", { step: "prepare" });
          reportError("cloud_migration_start", message, err);
          return;
        }
        analytics.track("cloud_migration_started", {
          agent_count: tasks.length,
          bytes: tasks.reduce((n, t) => n + t.manifest.totalBytes, 0),
        });
        for (const task of tasks) {
          if (get().deferred) break; // user chose "Migrate later"
          if (get().progress[task.sourceId]?.step === "done") continue;
          await runTask(task, false);
        }
        if (!get().deferred) await settleIfAllDone();
      },

      retryTask: async (sourceId) => {
        const task = get().tasks.find((t) => t.sourceId === sourceId);
        if (!task || get().progress[sourceId]?.step !== "error") return;
        // The source host may have died since (it never restarts itself);
        // re-invoking the spawn is the documented idempotent recovery.
        try {
          sourceHost = await osStartMigrationSourceHost();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          patchProgress(set, sourceId, {
            step: "error",
            errorMessage: message,
          });
          reportError("cloud_migration_retry", message, err);
          return;
        }
        await runTask(task, true);
        await settleIfAllDone();
      },

      continueAnyway: () => {
        void finish();
      },

      deferMigration: () => {
        set(() => ({ deferred: true }));
        // Stop the passive source host now; the run loop breaks after the
        // task in flight. Best-effort — never blocks the user leaving.
        void osStopMigrationSourceHost().catch((err: unknown) =>
          reportError(
            "cloud_migration_defer_stop",
            err instanceof Error ? err.message : String(err),
            err,
          ),
        );
      },
    };
  },
);
