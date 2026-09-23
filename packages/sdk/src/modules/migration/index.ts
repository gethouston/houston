/**
 * The migration module — moving one agent's data into another agent, as a
 * sequence of zip chunks: the export half reads an agent's in-scope files out,
 * the import half writes them into the target, and the marker pair records on
 * the target that the transfer finished, so a resumed run skips an agent whose
 * data already landed. "Copy an agent" and the desktop-to-cloud wizard are the
 * two flows built on it.
 *
 * These are pure commands over host routes the gateway proxies per agent: a
 * chunk is exported and imported on the caller's own schedule, so there is no
 * reactive scope to publish and nothing here subscribes to an event.
 *
 * The `dispatch` path is deliberately not wired: everything crossing that
 * boundary is plain JSON, and the two halves that move data carry the archive
 * as raw bytes — `migrationExport` answers an `ArrayBuffer` and
 * `migrationImport` takes one. The whole family is reached through the typed
 * facade, the marker pair included.
 *
 * SEAM — the module's own {@link moduleScope}, rooted at the base URL, never
 * `clientFor(agentId)`. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier.
 *
 * Nothing degrades here: every non-2xx throws a `MigrationHttpError` carrying
 * its `status`, and the surface decides what a 404 means for it.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import {
  migrationComplete,
  migrationExport,
  migrationImport,
  migrationStatus,
} from "./http";
import type {
  MigrationCounts,
  MigrationImportOptions,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
} from "./types";

export type {
  MigrationCounts,
  MigrationImportOptions,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
} from "./types";

/** The typed facade for the migration family. Every call throws on a non-2xx. */
export interface MigrationModule {
  /** Zip the given agent-root-relative paths of one agent into one archive. */
  migrationExport(agentId: string, paths: string[]): Promise<ArrayBuffer>;
  /** Unpack one archive into an agent; answers what landed and what did not. */
  migrationImport(
    agentId: string,
    bytes: ArrayBuffer,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
  /** Stamp the server-authoritative import marker on the target agent. */
  migrationComplete(
    agentId: string,
    source: MigrationSource,
    counts: MigrationCounts,
  ): Promise<void>;
  /** The target agent's import marker; `null` when the server has none. */
  migrationStatus(agentId: string): Promise<MigrationMarker | null>;
}

/** A failed migration request. `status` is the upstream HTTP status. */
export class MigrationHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "MigrationHttpError");
  }
}

export function createMigrationModule(ctx: ModuleContext): MigrationModule {
  const scope = moduleScope(ctx, "migration", MigrationHttpError);

  return {
    migrationExport: (agentId, paths) => migrationExport(scope, agentId, paths),
    migrationImport: (agentId, bytes, opts) =>
      migrationImport(scope, agentId, bytes, opts),
    migrationComplete: (agentId, source, counts) =>
      migrationComplete(scope, agentId, source, counts),
    migrationStatus: (agentId) => migrationStatus(scope, agentId),
  };
}
