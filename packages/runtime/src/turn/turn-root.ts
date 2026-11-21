import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config";
import { turnSharedSkillsDir } from "./turn-shared-skills";
import type { TurnRequest } from "./types";

export const TURN_ROOT_PREFIX = "houston-turn-";

export type TurnRootIdentity = Pick<
  TurnRequest,
  "workspaceId" | "agentId" | "conversationId"
>;

export function conversationTurnRoot(
  id: TurnRootIdentity,
  base: string = tmpdir(),
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([id.workspaceId, id.agentId, id.conversationId]))
    .digest("hex")
    .slice(0, 16);
  return join(base, `${TURN_ROOT_PREFIX}${digest}`);
}

export async function createTurnRoot(
  id: TurnRootIdentity,
  base: string = tmpdir(),
  shared: boolean = config.toolShell !== null,
): Promise<string> {
  const root = conversationTurnRoot(id, base);
  try {
    await mkdir(root, { mode: 0o700 });
    if (shared) await openToGroup(root);
    return root;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const fallback = await mkdtemp(join(base, TURN_ROOT_PREFIX));
  if (shared) await openToGroup(fallback);
  console.info(
    `[turn] conversation root ${root} already exists (a concurrent or leftover turn); running in ${fallback}, so this turn misses the prompt cache`,
  );
  return fallback;
}

export async function prepareTurnRoot(id: TurnRootIdentity): Promise<string> {
  const root = await createTurnRoot(id);
  await Promise.all([
    mkdir(join(root, "home"), { recursive: true, mode: 0o755 }),
    mkdir(join(root, "claude-credstore"), { recursive: true, mode: 0o700 }),
    mkdir(turnSharedSkillsDir(root), { recursive: true, mode: 0o755 }),
  ]);
  return root;
}

async function openToGroup(dir: string): Promise<void> {
  const { mode } = await stat(dir);
  await chmod(dir, (mode & 0o2000) | 0o1770);
}
