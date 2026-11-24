import { join, relative, sep } from "node:path";
import {
  AgentSettingsWriteDeniedError,
  BoardWriteDeniedError,
  RoutineWriteDeniedError,
  SharedSkillReadOnlyError,
  UnsavedWriteError,
} from "./fs-guard-errors";
import { assertNotReadOnly, type Narrowing } from "./fs-guard-narrow";
import { contains, foldName, type RootBoundary } from "./fs-guard-paths";

export type KeepsWrite = (workspaceRelative: string) => boolean;

const PROTECTED_WRITES = [
  { family: "activity", refusal: BoardWriteDeniedError },
  { family: "routines", refusal: RoutineWriteDeniedError },
] as const;

export interface ProtectedWrites {
  root: string;
  readOnly: RootBoundary[];
  narrowing: Narrowing | null;
}

export function assertProtected(proven: string, walls: ProtectedWrites): void {
  for (const { family, refusal } of PROTECTED_WRITES) {
    const store = foldName(join(walls.root, ".houston", family));
    const target = foldName(proven);
    // The flat pre-v0.4 file too: the boot layout migration moves it into
    // the store when the store holds no document yet.
    if (contains(target, store) || target === `${store}.json`)
      throw new refusal();
  }
  for (const { canonical, lexical } of walls.readOnly) {
    if (contains(proven, canonical) || contains(proven, lexical))
      throw new SharedSkillReadOnlyError();
  }
  assertNotReadOnly(proven, walls.root, walls.narrowing);
}

export function assertKept(
  proven: string,
  root: string,
  keepsWrite: KeepsWrite | undefined,
): void {
  if (!keepsWrite || !contains(proven, root)) return;
  const rel = relative(root, proven).split(sep).join("/");
  if (keepsWrite(rel)) return;
  const folded = foldName(rel);
  if (
    folded === ".houston/config.json" ||
    folded.startsWith(".houston/config/")
  )
    throw new AgentSettingsWriteDeniedError();
  throw new UnsavedWriteError(rel);
}
