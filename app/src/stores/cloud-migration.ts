import { create } from "zustand";
import { analytics } from "../lib/analytics";
import type { MigrationTask } from "../lib/cloud-migration";
import { isMigrationDemo, runDemoMigration } from "../lib/cloud-migration-demo";
import { prepareMigration } from "../lib/cloud-migration-prepare";
import {
  type AgentMigrationProgress,
  initialProgress,
} from "../lib/cloud-migration-progress";
import { runMigrationTask } from "../lib/cloud-migration-runner";
import type { SourceHostHandshake } from "../lib/cloud-migration-transport";
import { reportError } from "../lib/error-report";
import {
  osBackupHoustonData,
  osStartMigrationSourceHost,
  osStopMigrationSourceHost,
} from "../lib/os-bridge";
import { useAgentStore } from "./agents";
import { finishRun, settleTaskFailure } from "./cloud-migration-finish";
import { useWorkspaceStore } from "./workspaces";

export type CloudMigrationScreen = "offer" | "progress" | "done";

interface CloudMigrationState {
  screen: CloudMigrationScreen;
  preparing: boolean;
  backingUp: boolean;
  startError: string | null;
  tasks: MigrationTask[];
  progress: Record<string, AgentMigrationProgress>;
  integrations: string[];
  start: () => Promise<void>;
  retryTask: (sourceId: string) => Promise<void>;
  continueAnyway: () => void;
  deferred: boolean;
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
          isAbandoned: () => get().deferred,
        });
        analytics.track("cloud_migration_agent_done", {
          bytes: task.manifest.totalBytes,
        });
      } catch (err) {
        settleTaskFailure(
          (patch) => patchProgress(set, task.sourceId, patch),
          get().progress[task.sourceId],
          err,
          get().deferred,
        );
      }
    };

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
          if (get().deferred) break;
          if (get().progress[task.sourceId]?.step === "done") continue;
          await runTask(task, false);
        }
        if (!get().deferred) await settleIfAllDone();
      },

      retryTask: async (sourceId) => {
        const task = get().tasks.find((t) => t.sourceId === sourceId);
        if (!task || get().progress[sourceId]?.step !== "error") return;
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
