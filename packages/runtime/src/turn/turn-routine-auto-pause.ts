import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  autoPauseRoutine,
  docKey,
  loadRoutineRuns,
  normalizeRoutines,
  parseJsonDoc,
  routineAutoPause,
  saveRoutines,
  snoozeAfterRun,
  snoozeRoutine,
  unsnoozeAfterRun,
  upsertById,
} from "@houston/domain";
import {
  atomicTempPath,
  type Routine,
  type RoutineRun,
} from "@houston/protocol";
import {
  ObjectNotFoundError,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";
import { fsTextStore } from "./turn-fs-store";

interface RoutineMutationOpts {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  routineId: string;
  nowIso: string;
}

export async function autoPauseRoutineTurn(
  opts: RoutineMutationOpts,
): Promise<Routine | null> {
  return mutateRoutine(opts, async (routine) => {
    const { items: runs } = await loadRoutineRuns(
      fsTextStore(),
      opts.filesystem.workspaceDir,
    );
    const pause = routineAutoPause(routine, runs, opts.nowIso);
    return pause ? autoPauseRoutine(routine, pause) : null;
  });
}

export async function snoozeRoutineTurn(
  opts: RoutineMutationOpts & { run: RoutineRun; actingSub?: string | null },
): Promise<Routine | null> {
  return mutateRoutine(opts, async (routine) => {
    const snooze = snoozeAfterRun(
      routine,
      opts.run,
      opts.nowIso,
      opts.actingSub,
    );
    if (snooze) return snoozeRoutine(routine, snooze);
    return unsnoozeAfterRun(routine, opts.run, opts.actingSub);
  });
}

async function mutateRoutine(
  opts: RoutineMutationOpts,
  change: (routine: Routine) => Promise<Routine | null>,
): Promise<Routine | null> {
  const { filesystem } = opts;
  const root = filesystem.workspaceRel;
  const relativePath = docKey(root, "routines");
  return mutateTurnDocument<Routine | null>({
    store: opts.store,
    prefix: opts.prefix,
    filesystem,
    relativePath,
    shouldCommit: (changed) => changed !== null,
    apply: async () => {
      const routines = await remoteRoutines(opts, relativePath);
      const routine = routines?.find((r) => r.id === opts.routineId);
      if (!routines || !routine) return null;
      const changed = await change(routine);
      if (!changed) return null;
      await saveRoutines(filesystem.vfs, root, upsertById(routines, changed));
      return changed;
    },
  });
}

async function remoteRoutines(
  opts: { store: ObjectStore; prefix: string; filesystem: TurnFilesystem },
  relativePath: string,
): Promise<Routine[] | null> {
  const key = opts.prefix
    ? posix.join(opts.prefix, relativePath)
    : relativePath;
  const temp = atomicTempPath(
    join(opts.filesystem.storeRoot, ...relativePath.split("/")),
    `${randomUUID()}.pause`,
  );
  try {
    await opts.store.download(key, temp);
    return normalizeRoutines(
      parseJsonDoc(await readFile(temp, "utf8"), key),
      key,
    ).items;
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return null;
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}
