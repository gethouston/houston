import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { SeedOp } from "./op-grammar-seed";
import type { DocDeps, OpClaimTurn } from "./op-republish";
import { classifySeedListing, listPrefix } from "./op-seed-listing";
import { publishSeedDocs } from "./op-seed-publish";
import { syncSeedTree, withdrawSeedTree } from "./op-seed-sync";
import {
  buildSeedTree,
  pruneLegacyFamilies,
  pruneListed,
  type SeedTree,
} from "./op-seed-tree";
import { RUNTIME_VIEW_SOURCES, type SeedViewSources } from "./op-seed-views";
import type { OpRequest } from "./parse-op-request";

export interface SeedReply {
  status: number;
  body: unknown;
}

export interface SeedOpInput {
  deps: DocDeps;
  op: OpRequest & { op: SeedOp };
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  root: string;
  fenced: () => Promise<boolean>;
  views?: SeedViewSources;
}

const RESTORE_PENDING = {
  error: "agent data restore pending",
  code: "restore_pending",
};

const relayed = (status: number, body: unknown): SeedReply => ({
  status: 200,
  body: {
    ok: true,
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    events: [],
  },
});

export function executeSeedOp(input: SeedOpInput): Promise<SeedReply> {
  return seedOnce(input, true);
}

async function seedOnce(
  input: SeedOpInput,
  mayRetry: boolean,
): Promise<SeedReply> {
  const { op, store, prefix } = input;
  const seeds = Object.keys(op.op.seeds ?? {});
  if (seeds.some((key) => key.startsWith(".houston/runtime/")))
    return { status: 200, body: { ok: true, decline: true } };
  const { objects, rels } = await listPrefix(store, prefix);
  const listing = await classifySeedListing(rels, input.root);
  if (listing.kind === "refuse") {
    console.warn(`[op] seed refused: ${listing.reason} prefix=${prefix}`);
    return relayed(409, RESTORE_PENDING);
  }
  const payload = op.op.claudeMd !== undefined || op.op.seeds !== undefined;
  const storeRoot = await mkdtemp(join(input.root, "seed-"));
  const publishDocs = (tree: SeedTree, adopted = false) =>
    publishSeedDocs({
      adopted,
      deps: input.deps,
      turn: input.turn,
      store,
      prefix,
      objects,
      storeRoot,
      tree,
      views: input.views ?? RUNTIME_VIEW_SOURCES,
    });
  if (listing.kind === "adopt" && !payload) {
    if (op.op.republish)
      await publishDocs(
        { id: listing.id, workspaceRel: listing.workspaceRel },
        true,
      );
    return relayed(200, { id: listing.id, adopted: true });
  }

  const actor = op.actingAs?.userId;
  let tree: SeedTree;
  if (listing.kind === "adopt") {
    const [workspaceId = "", name = ""] = listing.id.split("/");
    tree = await buildSeedTree(storeRoot, op.op, actor, { workspaceId, name });
    await pruneListed(storeRoot, tree, new Set(rels));
    await pruneLegacyFamilies(storeRoot, tree, rels);
  } else {
    tree = await buildSeedTree(storeRoot, op.op, actor);
  }
  if (await input.fenced())
    return { status: 409, body: { error: "claim_fenced" } };
  const synced = await syncSeedTree(store, prefix, storeRoot, tree);
  if (synced.skipped.length > 0) {
    console.error(
      `[op] seed not durable: skipped=${synced.skipped.length} prefix=${prefix}`,
    );
    return relayed(413, {
      error: "file too large to store",
      files: synced.skipped.map((s) => s.key),
    });
  }
  if (synced.conflicts.length > 0) {
    console.warn(
      `[op] seed raced another writer: conflicts=${synced.conflicts.map((c) => c.key).join(",")} prefix=${prefix}`,
    );
    if (listing.kind === "empty") {
      await withdrawSeedTree(store, prefix, synced);
      return mayRetry ? seedOnce(input, false) : relayed(409, RESTORE_PENDING);
    }
  }
  const wrote = synced.uploaded.length;
  if (
    listing.kind === "empty" ||
    (synced.conflicts.length === 0 && (wrote > 0 || op.op.republish))
  )
    await publishDocs(tree, listing.kind === "adopt");
  return listing.kind === "empty"
    ? relayed(201, { id: tree.id, adopted: false })
    : relayed(200, { id: listing.id, adopted: true, completed: wrote });
}
