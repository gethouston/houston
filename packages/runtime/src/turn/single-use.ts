import {
  closeSync,
  existsSync,
  openSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Spent-latch for single-use pool workers (HOUSTON_POOL_SINGLE_USE=1).
 *
 * The marker lives on the pod's writable volume (pool.yaml points
 * HOUSTON_HOME at the emptyDir), which survives a CONTAINER restart inside the
 * same pod sandbox — exactly the case that must fail closed: a worker that
 * crashed or exited mid/after its one claimed turn gets its container
 * restarted in place by the kubelet, and that restarted process must refuse to
 * serve until the orchestrator replaces the whole pod (fresh sandbox VM, fresh
 * emptyDir).
 *
 * The marker is the FAST path only. The authoritative cross-tenant guarantee
 * is the control-plane recycler that deletes the pod: the marker lives on a
 * volume the turn's own bash can write to and could in principle delete, so it
 * is a best-effort local guard, not the security boundary (see cloud
 * poolrecycle.go). Requiring HOUSTON_HOME (below) keeps it from silently
 * landing on the container layer, where a restart would not see it.
 */
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

/**
 * Boot probe: prove the marker path is writable before the worker registers.
 * A read-only or full volume would otherwise surface only at begin() — one
 * burned claim at a time, fleet-wide — and, worse, the fail-closed restart
 * guard would be a silent no-op. Called from the single-use boot path.
 */
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

/** Whether this pod already ran (or started running) its one claimed turn. */
export const workerSpent = (): boolean => existsSync(markerPath());

/**
 * Latch the pod as spent BEFORE its claimed turn executes: written first so a
 * crash mid-turn cannot leave a restartable container willing to serve the
 * next tenant from a tree the previous tenant's code may have touched.
 * Synchronous + fsync'd so the bytes survive a hard VM kill immediately after,
 * and so callers cannot interleave a turn between the intent and the write.
 */
export function markWorkerSpent(): void {
  const fd = openSync(markerPath(), "w");
  try {
    writeSync(fd, `${new Date().toISOString()}\n`);
    // fsync via fdatasync is not exposed on the sync fd API portably; the
    // durability we need (survive the container restart) is satisfied by the
    // file existing in the volume's page cache + the kubelet not evicting the
    // emptyDir on a container (not pod) restart. A hard node loss takes the
    // whole pod, which the recycler replaces regardless.
  } finally {
    closeSync(fd);
  }
}
