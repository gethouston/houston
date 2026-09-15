/**
 * What a failed gateway call of the desktop→cloud wizard says on the per-agent
 * row.
 *
 * This is a COPY surface, not plumbing: the row renders the thrown
 * `Error.message` verbatim (`components/onboarding/cloud-migration/
 * progress-agent-row.tsx`), so a server-side refusal keeps the server's own
 * reason behind the step's label — `"migration import: import body too large"`
 * — while the two states the user can actually act on, signed out and no
 * engine to talk to, read as authored product copy instead.
 *
 * A failure that never reached a server is NOT re-worded here. The browser's
 * own `TypeError` is what the connectivity classifier keys on
 * (`network-transport-error.ts`), and a wizard that rewrote it would file every
 * upload the network cut as a bug and show the user a raw browser string.
 *
 * Dependency-injected end to end — the copy comes in, the engine comes in — so
 * `node --test` drives it with no window, no i18n and no engine.
 * `cloud-migration-transport.ts` is the live wiring.
 */

import type {
  MigrationCounts,
  MigrationImportOptions,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
} from "@houston/engine-adapter";
// The relative path, not the package alias: this module is driven by
// `node --test` (app/tests), which resolves no bundler alias. Same reason as
// `network-transport-error.ts` and its siblings in this directory.
import {
  isHoustonEngineError,
  isSignedOutEngineError,
} from "@houston/engine-adapter/client/errors";

/** The authored copy for the two states the user can act on. */
export interface MigrationErrorCopy {
  /** The app holds no bound engine at all, so nothing was sent. */
  notConnected: string;
  /** The session is gone; the call was answered locally, never sent. */
  signedOut: string;
}

/** The half of the bound client the wizard's gateway leg uses. */
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
  /** Resolved per call, and it THROWS before the app has a bound client. */
  engine: () => MigrationGatewayEngine;
  copy: MigrationErrorCopy;
}

/** The reason the server named, when it named one as a plain string. */
function serverReason(err: unknown): string | null {
  if (!isHoustonEngineError(err)) return null;
  const detail = (err.body as { error?: unknown } | null)?.error;
  return typeof detail === "string" && detail ? detail : null;
}

/**
 * One failure as the row states it: `"<label>: <server reason>"`, or
 * `"<label>: HTTP <status>"` when the answer named no reason. A failure with no
 * status at all keeps its own message — it has no server side to quote.
 */
export function migrationErrorMessage(label: string, err: unknown): string {
  const reason = serverReason(err);
  if (reason) return `${label}: ${reason}`;
  if (isHoustonEngineError(err)) return `${label}: HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * The failure to throw in place of `err`: authored copy for signed out, the
 * labelled server reason for anything the gateway answered, and the original
 * error UNTOUCHED for anything that never got an answer.
 */
export function toMigrationError(
  label: string,
  err: unknown,
  copy: MigrationErrorCopy,
): unknown {
  if (isSignedOutEngineError(err)) return new Error(copy.signedOut);
  if (!isHoustonEngineError(err)) return err;
  return new Error(migrationErrorMessage(label, err));
}

/**
 * Run one gateway call of the wizard, with the row's copy on any failure.
 * `label` names the step in the message a server-side refusal produces.
 */
export async function migrationCall<T>(
  label: string,
  deps: MigrationCallDeps,
  call: (engine: MigrationGatewayEngine) => Promise<T>,
): Promise<T> {
  let engine: MigrationGatewayEngine;
  try {
    engine = deps.engine();
  } catch {
    // No bound client is not a defect to report: it is the deployment having
    // no cloud to reach, and the copy is what the user can act on.
    throw new Error(deps.copy.notConnected);
  }
  try {
    return await call(engine);
  } catch (err) {
    throw toMigrationError(label, err, deps.copy);
  }
}

/**
 * Reads a 404 as "the server holds nothing here". ONLY for the import marker:
 * a pod predating the status route answers 404, which the wizard treats as
 * "never imported" — resume just won't skip that agent, which at worst re-plans
 * it under a renamed target. Every other status still throws.
 */
export async function nullOn404<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (isHoustonEngineError(err) && err.status === 404) return null;
    throw err;
  }
}
