import { mkdtemp } from "node:fs/promises";
import { join, posix } from "node:path";
import { docKey, type HoustonFamily } from "@houston/domain";
import {
  canonicalJSON,
  etagRevision,
  parseDocBody,
} from "@houston/host/src/docs/wire";
import { MAX_UPLOAD_BYTES } from "@houston/host/src/turn/files-import";
import { LazyStoreVfs } from "@houston/host/src/vfs";
import {
  DEFAULT_EXCLUDES,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { familyDoc } from "./op-family-doc";
import {
  AGENT_DOC_FAMILIES,
  type DocDeps,
  docTarget,
  type OpClaimTurn,
} from "./op-republish";
import {
  type ActivityDocOptions,
  acceptPut,
  putAtRevision,
  request,
} from "./turn-activity-doc";
import { TURN_HYDRATE_MAX_BYTES } from "./turn-filesystem";

export interface MigrateProjection {
  published: HoustonFamily[];
  lagging: string[];
  reprojected: boolean;
}

type FamilyOutcome = "published" | "current" | "unreadable";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function projectMigratedStore(input: {
  deps: DocDeps;
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  workspaceRel: string;
  root: string;
  uploaded: readonly string[];
  retryDelayMs?: number;
}): Promise<MigrateProjection> {
  const out: MigrateProjection = {
    published: [],
    lagging: [],
    reprojected: false,
  };
  const target = docTarget(input.deps, input.turn);
  const families = new Set<HoustonFamily>(target ? AGENT_DOC_FAMILIES : []);
  const routines = docKey(input.workspaceRel, "routines");
  let reproject = !input.uploaded.includes(routines);
  for (let round = 0; round < 2; round++) {
    if (round > 0)
      await new Promise((r) => setTimeout(r, input.retryDelayMs ?? 500));
    out.lagging = [];
    const objects = input.store.manifest
      ? await input.store.manifest(input.prefix)
      : [];
    const root = await mkdtemp(join(input.root, "fresh-"));
    const vfs = new LazyStoreVfs({
      store: input.store,
      prefix: input.prefix,
      root,
      objects,
      manifest: new Map(),
      excludes: DEFAULT_EXCLUDES,
      maxObjectBytes: MAX_UPLOAD_BYTES,
      maxBytes: TURN_HYDRATE_MAX_BYTES,
    });
    const listed = new Set(vfs.remoteKeys);
    for (const family of [...families]) {
      if (!target) break;
      try {
        const done = await projectFamily(
          { ...target, family },
          family,
          input.workspaceRel,
          vfs,
          listed,
        );
        families.delete(family);
        if (done === "published") out.published.push(family);
        if (done === "unreadable")
          console.warn(`[op] migrate: ${family} file unreadable, doc kept`);
      } catch (error) {
        out.lagging.push(`${family}: ${message(error)}`);
      }
    }
    const generation = objects.find(
      (o) => o.key === posix.join(input.prefix, routines),
    )?.generation;
    if (reproject && generation) {
      try {
        await vfs.readBytes(routines);
        await input.store.upload(
          join(root, ...routines.split("/")),
          posix.join(input.prefix, routines),
          { ifGenerationMatch: generation },
        );
        out.reprojected = true;
        reproject = false;
      } catch (error) {
        if (error instanceof StoreConflictError) reproject = false;
        else out.lagging.push(`routines projection: ${message(error)}`);
      }
    } else reproject = false;
    if (out.lagging.length === 0) break;
  }
  return out;
}

async function projectFamily(
  opts: ActivityDocOptions,
  family: HoustonFamily,
  workspaceRel: string,
  vfs: LazyStoreVfs,
  listed: ReadonlySet<string>,
): Promise<FamilyOutcome> {
  const seen = await request(opts);
  let revision = 0;
  let current: unknown;
  if (seen.ok) {
    const parsed = parseDocBody(await seen.text());
    revision = etagRevision(seen) ?? parsed.revision ?? 0;
    current = parsed.doc;
  } else {
    await seen.body?.cancel();
    if (seen.status !== 404) throw new Error(`GET rejected (${seen.status})`);
  }
  const key = docKey(workspaceRel, family);
  if (!listed.has(key) && current !== undefined) return "current";
  const raw = listed.has(key) ? await vfs.readText(key) : null;
  const doc = familyDoc(family, raw, key);
  if (doc === undefined) return "unreadable";
  if (current !== undefined && canonicalJSON(current) === canonicalJSON(doc))
    return "current";
  const response = await putAtRevision(opts, doc, revision);
  if (response.status === 409) {
    await response.body?.cancel();
    throw new Error("another projection landed; re-checking");
  }
  const outcome = await acceptPut(response);
  if ("error" in outcome) throw new Error(outcome.error);
  if (!("ok" in outcome)) throw new Error("doc route refused the family");
  return "published";
}
