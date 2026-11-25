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
  /** Families whose doc this run created or brought up to the file. */
  published: HoustonFamily[];
  /** Projections that still failed after a second round: the files are
   *  durable, these docs or the routine schedules lag. */
  lagging: string[];
  /** The routines file was rewritten in place to re-run its projections. */
  reprojected: boolean;
}

type FamilyOutcome = "published" | "current" | "unreadable";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What a pod's boot projected that a quiet agent may never have had: every
 * family doc, and the routine schedule and trigger projections that ride a
 * routines PUT. Read from the store AFTER the migration landed, each doc's
 * revision BEFORE its file: a doc PUT another writer lands after that read is
 * a 409 here, and a writer that landed earlier wrote a file this read sees.
 * So a newer projection is never replaced by an older one. A family with no
 * file only fills a missing doc (the pod's projector answers the empty doc);
 * a file no salvage can read is never projected over its doc. A failure gets
 * one more round; what still fails is reported, never thrown.
 */
export async function projectMigratedStore(input: {
  deps: DocDeps;
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  workspaceRel: string;
  /** A scratch directory for the fresh reads. */
  root: string;
  /** Store-relative keys this run's sync uploaded. */
  uploaded: readonly string[];
  /** Pause before the second round (test seam). */
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
  // An upload of the file already ran its projections.
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
    for (const family of Array.from(families)) {
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
        // A conflict is a newer write, whose own PUT projected it.
        if (error instanceof StoreConflictError) reproject = false;
        else out.lagging.push(`routines projection: ${message(error)}`);
      }
    } else reproject = false;
    if (out.lagging.length === 0) break;
  }
  return out;
}

/** One family's doc brought up to its file. Throws what may pass on retry. */
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
    // Another projection landed after the revision read. It is not proof
    // the doc matches the file (a late PUT can carry older content): the
    // next round reads both again.
    await response.body?.cancel();
    throw new Error("another projection landed; re-checking");
  }
  const outcome = await acceptPut(response);
  if ("error" in outcome) throw new Error(outcome.error);
  // A store that will not take the doc leaves it unprojected: unconfirmed.
  if (!("ok" in outcome)) throw new Error("doc route refused the family");
  return "published";
}
