import { existsSync, mkdirSync } from "node:fs";
import { migrateAgentLayouts } from "../migrate/agent-layout";
import { reseedAgentSchemas } from "../migrate/agent-schemas";
import { migrateChatHistory } from "../migrate/chat-history";
import { backfillRoutineCreatedBy } from "../migrate/routine-created-by";
import { severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { LocalHostState } from "./host-state";

export async function runHostMigrations(
  opts: LocalHostOptions,
  state: LocalHostState,
) {
  const { boot, sharedMirrorDir, sharedMirror, remoteCustomSecrets } = state;
  const migrationsT0 = Date.now();
  // Shared storage is a disposable synchronized mirror, not a readiness
  // invariant. Start its pull after authoritative agent hydration but do
  // not await the network; the first turn joins it through beforeTurn.
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
  // Managed cloud: migrate the hydrated plaintext custom-integration file
  // into Secret Manager before starting the watcher/sync loop. Removing it
  // after every upload succeeds makes the first sync delete the old GCS
  // object; a partial failure leaves it intact for a safe boot retry.
  // Passive hosts (a read-only conversion source) must not mutate custody:
  // no legacy migration.
  if (remoteCustomSecrets && !opts.passive) {
    const migrated = await remoteCustomSecrets.migrateLegacy();
    if (migrated > 0) {
      console.log(
        `[local-host] migrated ${migrated} custom integration secret(s) to remote custody`,
      );
    }
  }
  // One-time, idempotent migration of the pre-v0.4 FLAT `.houston/` layout
  // into the per-type folders the domain reads (ported from the Rust
  // engine's migrate_agent_data). Runs BEFORE the watcher so migrated files
  // are on disk when reactivity turns on; originals stay in place as a
  // rollback net and re-boots are no-ops (old-exists && new-missing).
  try {
    migrateAgentLayouts({ workspacesRoot: opts.workspacesRoot });
  } catch (err) {
    // No UI thread to toast on at boot; the supervisor must stay up. Log
    // loudly so the failure shows in the app logs / bug report tail.
    console.error(
      "[local-host] agent-layout migration failed (continuing):",
      err,
    );
  }
  // Bring every EXISTING agent's seeded `.houston/**.schema.json` up to the
  // schemas this build ships (they are seeded once, at agent creation, and
  // are app data — a stale `additionalProperties: false` copy actively tells
  // the model to strip fields the host stamps). Content-compared, so a
  // steady-state boot writes nothing; runs BEFORE the watcher like the
  // migrations above.
  try {
    reseedAgentSchemas({ workspacesRoot: opts.workspacesRoot });
  } catch (err) {
    // No UI thread to toast on at boot; the supervisor must stay up. Log
    // loudly so the failure shows in the app logs / bug report tail.
    console.error(
      "[local-host] agent schema re-seed failed (continuing):",
      err,
    );
  }
  // Managed pods: stamp the org owner as `created_by` on routines recorded
  // before gateway-fronted pods stamped acting identities. The control-plane
  // fire planner treats an authorless routine as not fireable, so once
  // pre-wake suppression turns on those routines would never run again; the
  // planner's snapshot is projected from this very doc on its next
  // store-sync upload, so the boot stamp is the whole repair. Runs AFTER
  // hydration (the doc comes from the object store) and BEFORE the watcher,
  // like the migrations above. Desktop/self-host never set ownerSub.
  if (opts.gatewayFronted && opts.ownerSub && !opts.passive) {
    try {
      backfillRoutineCreatedBy({
        workspacesRoot: opts.workspacesRoot,
        ownerSub: opts.ownerSub,
      });
    } catch (err) {
      // No UI thread to toast on at boot; the supervisor must stay up. Log
      // loudly so the failure shows in the app logs / bug report tail.
      console.error(
        "[local-host] routine created_by backfill failed (continuing):",
        err,
      );
    }
  }
  // Additive, idempotent migration of the Rust-desktop era's chat history
  // (SQLite chat_feed) into each agent's `.houston/runtime/`. Runs BEFORE
  // the watcher so its writes are already on disk when reactivity turns
  // on, and only when the db is actually present. Never modifies the db or
  // the existing tree; per-conversation existence checks make re-boots
  // cheap no-ops (deliberately re-scanned every boot — see chat-history.ts
  // on why a wholesale per-agent marker lost data).
  if (opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)) {
    try {
      migrateChatHistory({
        workspacesRoot: opts.workspacesRoot,
        dbPath: opts.chatHistoryDbPath,
      });
    } catch (err) {
      // No UI thread to toast on at boot; the supervisor must stay up. Log
      // loudly so the failure shows in the app logs / bug report tail.
      console.error(
        "[local-host] chat-history migration failed (continuing):",
        err,
      );
    }
  }
  boot.record("migrations", Date.now() - migrationsT0);
}
