import type { MigrationImportCommit } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import {
  migrationComplete,
  migrationExport,
  migrationImport,
  migrationStatus,
} from "./http";
import { importArchive } from "./import-archive";
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
    bytes: ArrayBuffer | MigrationImportCommit,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
  /** Transfer a device archive through a resumable session, then commit it. */
  importArchive(
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
    /** Transfer and commit a device archive.
     * @assistant group:files hidden: the migration wizard supplies binary archives.
     * @assistant unroutable: composes session transfer and migration commit. */
    importArchive: (agentId, bytes, opts) =>
      importArchive(scope, agentId, bytes, opts),
    migrationComplete: (agentId, source, counts) =>
      migrationComplete(scope, agentId, source, counts),
    migrationStatus: (agentId) => migrationStatus(scope, agentId),
  };
}
