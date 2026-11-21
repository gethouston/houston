import { mkdir, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { TurnSetupCode as WireTurnSetupCode } from "@houston/wire-types";
import { realAgents, standingTree } from "./turn-layout-agents";

export type TurnSetupCode =
  | "credential_write_failed"
  | "hydrate_over_cap"
  | "layout_unexpected"
  | "agent_not_migrated"
  | "message_refused";

type SameCodes = [TurnSetupCode] extends [WireTurnSetupCode]
  ? [WireTurnSetupCode] extends [TurnSetupCode]
    ? true
    : never
  : never;
export const TURN_SETUP_CODES_MATCH_WIRE: SameCodes = true;

export class TurnSetupError extends Error {
  constructor(
    readonly code: TurnSetupCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TurnSetupError";
  }
}

export class StoreEmptyError extends TurnSetupError {
  constructor() {
    super(
      "layout_unexpected",
      "hydrated store is empty; a claimed turn needs an existing agent",
    );
    this.name = "StoreEmptyError";
  }
}

export interface TurnLayout {
  kind: "standing" | "cloudrun";
  workspaceDir: string;
  workspaceRel: string;
  dataDir: string;
  dataRel: string;
}

const storeRelative = (storeRoot: string, path: string) =>
  relative(storeRoot, path).split(sep).join("/");

export async function resolveTurnLayout(
  storeRoot: string,
  opts: { allowEmpty?: boolean; listed?: readonly string[] } = {},
): Promise<TurnLayout> {
  const standing = await standingTree(storeRoot);
  const rootEntries = (
    await readdir(storeRoot, { withFileTypes: true })
  ).filter((entry) => standing.present || entry.name !== "workspaces");
  const rootDirectories = new Set(
    rootEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const hasWorkspaces = standing.present;
  const hasData = rootDirectories.has("data");
  const hasWorkspace = rootDirectories.has("workspace");
  const candidates = standing.candidates;
  const agents =
    candidates.length > 1
      ? await realAgents(storeRoot, candidates, opts.listed ?? [])
      : candidates;

  if ((hasWorkspaces && hasData) || agents.length > 1) {
    throw new TurnSetupError(
      "layout_unexpected",
      "hydrated store contains more than one agent layout",
    );
  }
  if (candidates.length > 1 && agents.length === 0) {
    throw new TurnSetupError(
      "layout_unexpected",
      `hydrated store has ${candidates.length} agent folders and none carries an agent's files`,
    );
  }
  if (agents.length === 1) {
    const workspaceDir = agents[0] as string;
    const dataDir = join(workspaceDir, ".houston", "runtime");
    await mkdir(dataDir, { recursive: true });
    return {
      kind: "standing",
      workspaceDir,
      workspaceRel: storeRelative(storeRoot, workspaceDir),
      dataDir,
      dataRel: storeRelative(storeRoot, dataDir),
    };
  }
  if (
    hasData ||
    hasWorkspace ||
    (rootEntries.length === 0 && (opts.allowEmpty ?? true))
  ) {
    const workspaceDir = join(storeRoot, "workspace");
    const dataDir = join(storeRoot, "data");
    await Promise.all([
      mkdir(workspaceDir, { recursive: true }),
      mkdir(dataDir, { recursive: true }),
    ]);
    return {
      kind: "cloudrun",
      workspaceDir,
      workspaceRel: "workspace",
      dataDir,
      dataRel: "data",
    };
  }
  if (rootEntries.length === 0) throw new StoreEmptyError();
  throw new TurnSetupError(
    "layout_unexpected",
    "hydrated store does not contain a recognized agent layout",
  );
}

export async function layoutSkeleton(
  storeRoot: string,
  rels: readonly string[],
) {
  const dirs = new Set<string>();
  for (const rel of rels) {
    const segments = rel.split("/");
    const depth = segments[0] === "workspaces" ? 3 : 1;
    if (segments.length > depth) dirs.add(segments.slice(0, depth).join("/"));
  }
  await Promise.all(
    [...dirs].map((dir) =>
      mkdir(join(storeRoot, ...dir.split("/")), { recursive: true }),
    ),
  );
}

export async function resolveListedLayout(
  storeRoot: string,
  listed: readonly string[],
  opts: { allowEmpty?: boolean },
): Promise<TurnLayout> {
  await layoutSkeleton(storeRoot, listed);
  return resolveTurnLayout(storeRoot, { ...opts, listed });
}
