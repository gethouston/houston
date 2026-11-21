import { join } from "node:path";
import {
  AGENT_STORE_MIGRATION_VERSION,
  migrateAgentStore,
} from "@houston/host/src/migrate/agent-store";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { MigrateOp } from "./op-grammar-migrate";
import { moveLegacySecrets } from "./op-migrate-custody";
import { projectMigratedStore } from "./op-migrate-project";
import { failed, type MigrateReply, relayed } from "./op-migrate-reply";
import { syncMigratedTree } from "./op-migrate-sync";
import { migrateHydrateFilter } from "./op-migrate-tree";
import type { DocDeps, OpClaimTurn } from "./op-republish";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { StoreEmptyError, TurnSetupError } from "./turn-layout";

export interface MigrateOpInput {
  deps: DocDeps & Pick<TurnServerDeps, "maxHydrateBytes">;
  op: OpRequest & { op: MigrateOp };
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  root: string;
  fenced: () => Promise<boolean>;
}

async function moveCustody(
  input: MigrateOpInput,
  storeRoot: string,
): Promise<Awaited<ReturnType<typeof moveLegacySecrets>>> {
  try {
    return await moveLegacySecrets({
      storeRoot,
      op: input.op,
      ...(input.deps.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
    });
  } catch (error) {
    console.error(
      `[op] migrate custody move failed, plaintext kept prefix=${input.prefix}:`,
      error,
    );
    return { moved: 0, complete: false };
  }
}

export async function executeMigrateOp(
  input: MigrateOpInput,
): Promise<MigrateReply> {
  const { op, store, prefix } = input;
  if (op.op.version > AGENT_STORE_MIGRATION_VERSION) {
    return relayed(409, {
      code: "migration_version_unsupported",
      version: AGENT_STORE_MIGRATION_VERSION,
    });
  }
  let filesystem: Awaited<ReturnType<typeof prepareTurnFilesystem>>;
  try {
    filesystem = await prepareTurnFilesystem({
      store,
      prefix,
      root: input.root,
      claimed: true,
      allowLegacyLayout: true,
      filter: migrateHydrateFilter,
      capListed: true,
      ...(input.deps.maxHydrateBytes !== undefined
        ? { maxBytes: input.deps.maxHydrateBytes }
        : {}),
    });
  } catch (error) {
    if (!(error instanceof TurnSetupError)) throw error;
    const code = error instanceof StoreEmptyError ? "store_empty" : error.code;
    console.error(
      `[op] migrate refused by the store code=${code} prefix=${prefix}: ${error.message}`,
    );
    return failed(code, { error: error.message });
  }
  const log = (line: string, error?: unknown) =>
    error === undefined
      ? console.log(`[op] migrate ${line}`)
      : console.error(`[op] migrate ${line}`, error);
  let report: Awaited<ReturnType<typeof migrateAgentStore>>;
  let custody: Awaited<ReturnType<typeof moveLegacySecrets>>;
  const fenced = { status: 409, body: { error: "claim_fenced" } };
  try {
    report = await migrateAgentStore({
      workspacesRoot: join(filesystem.storeRoot, "workspaces"),
      agentRoot: filesystem.workspaceDir,
      ...(op.op.ownerSub ? { ownerSub: op.op.ownerSub } : {}),
      log,
    });
    if (await input.fenced()) return fenced;
    custody = await moveCustody(input, filesystem.storeRoot);
  } catch (error) {
    console.error(`[op] migrate failed before sync prefix=${prefix}:`, error);
    return failed("migration_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (await input.fenced()) return fenced;
  const synced = await syncMigratedTree({
    store,
    prefix,
    storeRoot: filesystem.storeRoot,
    manifest: filesystem.manifest,
    workspaceRel: filesystem.workspaceRel,
    generationAware: filesystem.generationAware,
  });
  if (!synced.durable) {
    console.error(
      `[op] migrate not durable: conflicts=${synced.conflicts.length} skipped=${synced.skipped.length} prefix=${prefix}`,
    );
    return failed("migration_not_durable", {
      conflicts: synced.conflicts,
      skipped: synced.skipped,
    });
  }
  const projection = await projectMigratedStore({
    deps: input.deps,
    turn: input.turn,
    store,
    prefix,
    workspaceRel: filesystem.workspaceRel,
    root: input.root,
    uploaded: synced.uploaded,
  });
  if (projection.lagging.length > 0) {
    console.error(
      `[op] migrate projection lagging (the files are durable): ${projection.lagging.join("; ")} prefix=${prefix}`,
    );
  }
  return relayed(200, {
    version: AGENT_STORE_MIGRATION_VERSION,
    ...report,
    secretsMoved: custody.moved,
    uploaded: synced.uploaded.length,
    deleted: synced.deleted.length,
    docsPublished: projection.published,
    docsLagging: projection.lagging,
    routinesReprojected: projection.reprojected,
    complete: projection.lagging.length === 0 && custody.complete,
  });
}
