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

export interface MigrationModule {
  migrationExport(agentId: string, paths: string[]): Promise<ArrayBuffer>;
  migrationImport(
    agentId: string,
    bytes: ArrayBuffer | MigrationImportCommit,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
  importArchive(
    agentId: string,
    bytes: ArrayBuffer,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
  migrationComplete(
    agentId: string,
    source: MigrationSource,
    counts: MigrationCounts,
  ): Promise<void>;
  migrationStatus(agentId: string): Promise<MigrationMarker | null>;
}

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
