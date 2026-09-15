/**
 * The migration module — moving one agent's data into another agent, as a
 * sequence of zip chunks: the export half reads an agent's in-scope files out,
 * the import half writes them into the target. "Copy an agent" and the
 * desktop-to-cloud wizard are the two flows built on it.
 *
 * These are pure commands over host routes the gateway proxies per agent: a
 * chunk is exported and imported on the caller's own schedule, so there is no
 * reactive scope to publish and nothing here subscribes to an event.
 *
 * The bridge's `dispatch` path is deliberately not wired: both operations carry
 * the archive as raw bytes, and everything crossing that boundary is plain
 * JSON. A native shell moves an agent with its own file transport.
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
import { migrationExport, migrationImport } from "./http";
import type { MigrationImportOptions, MigrationImportResult } from "./types";

export type { MigrationImportOptions, MigrationImportResult } from "./types";

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
  };
}
