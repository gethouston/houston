import { PREFERENCES_NAMESPACE } from "@houston/domain";
import {
  type DirListing,
  isObjectPrefix,
  type ObjectMetadata,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { STARTUP_FOLDERS } from "./turn-deferred-rule";
import {
  type ClaimedStoreScope,
  claimedStoreScope,
  UNLISTED_ROOT_DIRS,
} from "./turn-store-scope";

/** The store, listed by store-relative directory. */
export interface StoreLister {
  /** Undefined: the store answered without levels (an older pod-store). */
  level(rel: string): Promise<DirListing | undefined>;
  tree(rel: string): Promise<ObjectMetadata[]>;
  relOf(key: string): string;
  keyOf(rel: string): string;
  /** The agent's own folders, listed whole (`ClaimedStoreScope.later`). */
  listLater(
    scope: ClaimedStoreScope,
    dirs: readonly string[] | undefined,
  ): Promise<ObjectMetadata[]>;
}

export function storeLister(
  store: ObjectStore,
  prefix: string,
): StoreLister | undefined {
  const manifestDir = store.manifestDir?.bind(store);
  const manifest = store.manifest?.bind(store);
  if (!manifestDir || !manifest) return undefined;
  const keyOf = (rel: string) =>
    prefix && rel ? `${prefix}/${rel}` : rel || prefix;
  const relOf = (key: string) => (prefix ? key.slice(prefix.length + 1) : key);
  const lister: StoreLister = {
    async level(rel) {
      const listing = await manifestDir(keyOf(rel));
      return (
        listing && { objects: listing.objects, dirs: listing.dirs.map(relOf) }
      );
    },
    tree: (rel) => manifest(keyOf(rel)),
    relOf,
    keyOf,
    async listLater(scope, dirs) {
      const own =
        dirs ??
        (await lister.level(scope.agentRoot))?.dirs.filter(scope.laterFolder);
      const listed = own
        ? (await Promise.all(own.map(lister.tree))).flat()
        : await lister.tree(scope.agentRoot);
      return listed.filter((object) => scope.later(relOf(object.key)));
    },
  };
  return lister;
}

const LEGACY_ROOT_DIRS = new Set(["data", "workspace"]);

const name = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

/** Hidden folders and the preferences namespace are never agents
 *  (turn-layout-agents.ts standingTree). */
const agentShaped = (rel: string) => !name(rel).startsWith(".");

/**
 * Walk a store holding exactly one standing agent and list its critical set
 * (ClaimedStoreScope.critical): a handful of rounds of one-level listings
 * instead of one listing of the whole store. Undefined for any other shape,
 * so its layout resolves exactly as from the whole listing.
 */
export async function listClaimedTree(
  list: StoreLister,
  conversationId: string,
): Promise<
  | { scope: ClaimedStoreScope; objects: ObjectMetadata[]; laterDirs: string[] }
  | undefined
> {
  const [top, workspaces] = await Promise.all([
    list.level(""),
    list.level("workspaces"),
  ]);
  if (!top || !workspaces || !top.dirs.includes("workspaces")) return undefined;
  if (top.dirs.some((dir) => LEGACY_ROOT_DIRS.has(dir))) return undefined;
  const levels: DirListing[] = [top, workspaces];
  const trees = top.dirs.filter(
    (dir) => dir !== "workspaces" && !UNLISTED_ROOT_DIRS.has(dir),
  );
  const standing = workspaces.dirs.filter(
    (dir) => agentShaped(dir) && name(dir) !== PREFERENCES_NAMESPACE,
  );
  trees.push(...workspaces.dirs.filter((dir) => !standing.includes(dir)));
  const candidates: string[] = [];
  for (const level of await Promise.all(standing.map(list.level))) {
    if (!level) return undefined;
    levels.push(level);
    candidates.push(...level.dirs.filter(agentShaped));
    trees.push(...level.dirs.filter((dir) => !agentShaped(dir)));
  }
  const [agent] = candidates;
  if (!agent || candidates.length > 1) return undefined;
  const scope = claimedStoreScope(agent, conversationId);
  const runtime = `${agent}/.houston/runtime`;
  const own = [
    scope.conversation.replace(/\.json$/, ".archive"),
    `${runtime}/sessions/${conversationId}`,
  ];
  if (!own.every(isObjectPrefix)) return undefined;
  const [agentLevel, houston, runtimeLevel, ...listed] = await Promise.all([
    list.level(agent),
    list.level(`${agent}/.houston`),
    list.level(runtime),
    ...[...trees, ...own].map(list.tree),
    ...[...STARTUP_FOLDERS]
      .filter((folder) => folder !== ".houston")
      .map((folder) => list.tree(`${agent}/${folder}`)),
  ]);
  if (!agentLevel || !houston || !runtimeLevel) return undefined;
  levels.push(agentLevel, houston, runtimeLevel);
  const inner = [
    ...houston.dirs.filter((dir) => dir !== runtime),
    ...runtimeLevel.dirs.filter(
      (dir) => !["conversations", "sessions"].includes(name(dir)),
    ),
  ];
  listed.push(...(await Promise.all(inner.map(list.tree))));
  const objects = [
    ...levels.flatMap((level) => level.objects),
    ...listed.flat(),
  ].filter((object) => scope.critical(list.relOf(object.key)));
  if (!objects.some((object) => list.relOf(object.key).startsWith(`${agent}/`)))
    return undefined;
  const laterDirs = agentLevel.dirs.filter(scope.laterFolder);
  return { scope, objects, laterDirs };
}
