import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Spent-latch for single-use pool workers (HOUSTON_POOL_SINGLE_USE=1).
 *
 * The marker lives on the pod's writable volume (pool.yaml points
 * HOUSTON_HOME and TMPDIR at the same emptyDir), which survives a CONTAINER
 * restart inside the same pod sandbox — exactly the case that must fail
 * closed: a worker that crashed or exited mid/after its one claimed turn gets
 * its container restarted in place by the kubelet, and that restarted process
 * must refuse to serve until the orchestrator replaces the whole pod (fresh
 * sandbox VM, fresh emptyDir).
 */
const markerPath = (): string =>
  join(process.env.HOUSTON_HOME || tmpdir(), ".houston-worker-spent");

/** Whether this pod already ran (or started running) its one claimed turn. */
export const workerSpent = (): boolean => existsSync(markerPath());

/**
 * Latch the pod as spent BEFORE its claimed turn executes: written first so a
 * crash mid-turn cannot leave a restartable container willing to serve the
 * next tenant from a tree the previous tenant's code may have touched.
 */
export const markWorkerSpent = (): Promise<void> =>
  writeFile(markerPath(), `${new Date().toISOString()}\n`);
