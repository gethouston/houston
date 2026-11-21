import { existsSync, mkdirSync } from "node:fs";
import { migrateAgentLayouts } from "../migrate/agent-layout";
import { reseedAgentSchemas } from "../migrate/agent-schemas";
import { migrateChatHistory } from "../migrate/chat-history";
import {
  isEnginePod,
  sweepGatewayGroupNotes,
} from "../migrate/gateway-group-notes";
import { sweepLegacySetupDirectives } from "../migrate/legacy-setup-directive";
import { backfillRoutineCreatedBy } from "../migrate/routine-created-by";
import { migrateSidebarLayout } from "../migrate/sidebar-layout";
import { severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { LocalHostState } from "./host-state";

export async function runHostMigrations(
  opts: LocalHostOptions,
  state: LocalHostState,
) {
  const {
    boot,
    sharedMirrorDir,
    sharedMirror,
    remoteCustomSecrets,
    store,
    vfs,
    paths,
  } = state;
  const migrationsT0 = Date.now();
  if (sharedMirrorDir) {
    try {
      mkdirSync(sharedMirrorDir, { recursive: true });
      sharedMirror?.wake();
    } catch (error) {
      severityLog(
        "[shared-mirror] wake sync failed; using current mirror",
        error,
      );
    }
  }
  if (remoteCustomSecrets && !opts.passive) {
    const migrated = await remoteCustomSecrets.migrateLegacy();
    if (migrated > 0) {
      console.log(
        `[local-host] migrated ${migrated} custom integration secret(s) to remote custody`,
      );
    }
  }
  if (!opts.passive) {
    try {
      await migrateSidebarLayout({ store, vfs, paths, log: severityLog });
    } catch (error) {
      severityLog("[local-host] sidebar layout migration failed", error);
    }
  }
  await sweepGatewayGroupNotes({
    enginePod: isEnginePod(opts),
    store,
    vfs,
    paths,
    log: severityLog,
  });
  try {
    migrateAgentLayouts({ workspacesRoot: opts.workspacesRoot });
  } catch (err) {
    console.error(
      "[local-host] agent-layout migration failed (continuing):",
      err,
    );
  }
  try {
    reseedAgentSchemas({ workspacesRoot: opts.workspacesRoot });
  } catch (err) {
    console.error(
      "[local-host] agent schema re-seed failed (continuing):",
      err,
    );
  }
  if (!opts.passive) {
    try {
      sweepLegacySetupDirectives({ workspacesRoot: opts.workspacesRoot });
    } catch (err) {
      console.error(
        "[local-host] legacy setup-section sweep failed (continuing):",
        err,
      );
    }
  }
  if (opts.gatewayFronted && opts.ownerSub && !opts.passive) {
    try {
      backfillRoutineCreatedBy({
        workspacesRoot: opts.workspacesRoot,
        ownerSub: opts.ownerSub,
      });
    } catch (err) {
      console.error(
        "[local-host] routine created_by backfill failed (continuing):",
        err,
      );
    }
  }
  if (opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)) {
    try {
      migrateChatHistory({
        workspacesRoot: opts.workspacesRoot,
        dbPath: opts.chatHistoryDbPath,
      });
    } catch (err) {
      console.error(
        "[local-host] chat-history migration failed (continuing):",
        err,
      );
    }
  }
  boot.record("migrations", Date.now() - migrationsT0);
}
