import type {
  MigrationCounts,
  MigrationImportOptions,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
} from "@houston/engine-adapter";
import {
  isHoustonEngineError,
  isSignedOutEngineError,
} from "@houston/engine-adapter/client/errors";

export interface MigrationErrorCopy {
  notConnected: string;
  signedOut: string;
}

export interface MigrationGatewayEngine {
  migrationImport(
    agentId: string,
    zip: ArrayBuffer,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
  migrationComplete(
    agentId: string,
    source: MigrationSource,
    counts: MigrationCounts,
  ): Promise<void>;
  migrationStatus(agentId: string): Promise<MigrationMarker | null>;
}

export interface MigrationCallDeps {
  engine: () => MigrationGatewayEngine;
  copy: MigrationErrorCopy;
}

function serverReason(err: unknown): string | null {
  if (!isHoustonEngineError(err)) return null;
  const detail = (err.body as { error?: unknown } | null)?.error;
  return typeof detail === "string" && detail ? detail : null;
}

export function migrationErrorMessage(label: string, err: unknown): string {
  const reason = serverReason(err);
  if (reason) return `${label}: ${reason}`;
  if (isHoustonEngineError(err)) return `${label}: HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}

export function toMigrationError(
  label: string,
  err: unknown,
  copy: MigrationErrorCopy,
): unknown {
  if (isSignedOutEngineError(err)) return new Error(copy.signedOut);
  if (!isHoustonEngineError(err)) return err;
  return new Error(migrationErrorMessage(label, err));
}

export async function migrationCall<T>(
  label: string,
  deps: MigrationCallDeps,
  call: (engine: MigrationGatewayEngine) => Promise<T>,
): Promise<T> {
  let engine: MigrationGatewayEngine;
  try {
    engine = deps.engine();
  } catch {
    throw new Error(deps.copy.notConnected);
  }
  try {
    return await call(engine);
  } catch (err) {
    throw toMigrationError(label, err, deps.copy);
  }
}

export async function nullOn404<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (isHoustonEngineError(err) && err.status === 404) return null;
    throw err;
  }
}
