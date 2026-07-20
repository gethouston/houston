/**
 * Legacy→cloud migration offer (the FINAL local-channel feature).
 *
 * Local (sidecar) builds stopped receiving feature updates after this
 * release; this store drives the one thing that ships in it — the offer to
 * install the CLOUD build in place. The install itself is a cross-channel
 * updater run done Rust-side (`install_cloud_migration`): the JS updater
 * API cannot override endpoints, and the cloud manifest lives on a
 * different feed than this build's baked `latest.json`.
 *
 * Policy is remote (`fetch_migration_policy`): "optional" renders a
 * dismissible offer; "required" removes dismissal. This build is the last
 * one on its channel, so the flip must work without shipping anything —
 * hence a release-asset JSON, not a compile-time flag. Every failure path
 * degrades to "optional".
 *
 * The offer shows on EVERY app launch (product decision — this is the
 * channel's sunset message, not a nag to tune down); dismissal only hides
 * it for the running session, and the Settings row reopens it on demand.
 */

import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { reportError } from "../lib/error-toast";
import {
  onCloudMigrationProgress,
  osCurrentAppBundlePath,
  osFetchMigrationPolicy,
  osInstallCloudMigration,
  osIsTauri,
  osRelaunchAppFromPath,
} from "../lib/os-bridge";

export type MigrateToCloudStatus = "idle" | "downloading" | "ready" | "error";

interface MigrateToCloudState {
  visible: boolean;
  policy: "optional" | "required";
  status: MigrateToCloudStatus;
  /** 0-100, or null while the total is unknown. */
  progress: number | null;
  initialize: () => Promise<void>;
  open: (source: "launch" | "settings" | "sidebar") => void;
  dismiss: () => void;
  install: () => Promise<void>;
  relaunch: () => Promise<void>;
}

/** The pre-install bundle path: captured before the updater moves the app,
 *  module-scoped like the ref in use-update-checker. */
let appPathBeforeInstall: string | null = null;

export const useMigrateToCloudStore = create<MigrateToCloudState>(
  (set, get) => ({
    visible: false,
    policy: "optional",
    status: "idle",
    progress: null,

    /** Called once at mount from the offer component (local builds only).
     *  Opens unconditionally: the offer greets every launch. */
    initialize: async () => {
      if (!osIsTauri()) return;
      const policy = await osFetchMigrationPolicy().catch(
        () => "optional" as const,
      );
      set({ policy });
      get().open("launch");
    },

    open: (source) => {
      if (get().visible) return;
      set({ visible: true });
      analytics.track("migrate_to_cloud_offered", { source });
    },

    dismiss: () => {
      if (get().policy === "required") return;
      set({ visible: false });
      analytics.track("migrate_to_cloud_dismissed", {});
    },

    install: async () => {
      if (get().status === "downloading") return;
      analytics.track("migrate_to_cloud_accepted", {});
      set({ status: "downloading", progress: null });
      let unlisten: (() => void) | null = null;
      try {
        appPathBeforeInstall = await osCurrentAppBundlePath();
        unlisten = await onCloudMigrationProgress(({ downloaded, total }) => {
          set({
            progress:
              total && total > 0
                ? Math.min(100, Math.round((downloaded / total) * 100))
                : null,
          });
        });
        await osInstallCloudMigration();
        set({ status: "ready", progress: 100 });
        analytics.track("migrate_to_cloud_installed", {});
      } catch (e) {
        reportError(
          "migrate_to_cloud_install",
          e instanceof Error ? e.message : String(e),
          e,
        );
        set({ status: "error" });
      } finally {
        unlisten?.();
      }
    },

    relaunch: async () => {
      try {
        const path = appPathBeforeInstall ?? (await osCurrentAppBundlePath());
        await osRelaunchAppFromPath(path);
      } catch (e) {
        reportError(
          "migrate_to_cloud_relaunch",
          e instanceof Error ? e.message : String(e),
          e,
        );
        set({ status: "error" });
      }
    },
  }),
);
