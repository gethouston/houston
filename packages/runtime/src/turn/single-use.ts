import {
  closeSync,
  existsSync,
  openSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

function markerDir(): string {
  const home = process.env.HOUSTON_HOME;
  if (!home) {
    throw new Error(
      "HOUSTON_POOL_SINGLE_USE=1 requires HOUSTON_HOME on a restart-surviving volume for the spent marker",
    );
  }
  return home;
}

const markerPath = (): string => join(markerDir(), ".houston-worker-spent");

export function assertMarkerWritable(): void {
  const probe = join(markerDir(), ".houston-worker-spent.probe");
  const fd = openSync(probe, "w");
  try {
    writeSync(fd, "ok");
  } finally {
    closeSync(fd);
  }
  unlinkSync(probe);
}

export const workerSpent = (): boolean => existsSync(markerPath());

export function markWorkerSpent(): void {
  const fd = openSync(markerPath(), "w");
  try {
    writeSync(fd, `${new Date().toISOString()}\n`);
  } finally {
    closeSync(fd);
  }
}

export function assertSingleUseIncarnationConfigured(
  singleUse: boolean,
  podUid: string,
): void {
  if (singleUse && !podUid.trim()) {
    throw new Error(
      "HOUSTON_POOL_SINGLE_USE=1 requires HOUSTON_POD_UID (downward API metadata.uid): the per-incarnation dispatch fence fails open without it — re-apply the pool manifest, do not only roll the image",
    );
  }
}
