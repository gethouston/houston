import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Collect the receipt files the retention window released, plus any temporary
 * a killed process abandoned mid-write. Nothing else ever deletes a receipt —
 * settling a turn only ends its in-memory claim — so without this pass a
 * channel-mirrored assistant keeps one file per inbound message forever, on a
 * data root that may be replicated.
 *
 * Asynchronous and sequential on purpose: this is housekeeping over a
 * directory with a week of files in it, and no turn may wait on it.
 *
 * `isActive` protects the receipts of turns still running in THIS process: one
 * of those is exactly what a concurrent retry reads, so collecting it would
 * admit that retry as brand-new work, however old the file is.
 */
export async function pruneMessageAdmissions(input: {
  directory: string;
  /** Receipts last written at or before this are released. */
  deadline: number;
  /**
   * The same for a `.tmp`: it promises nothing and answers nothing, so it is
   * held only long enough to outlive the write that is publishing it.
   */
  temporaryDeadline: number;
  isActive: (file: string) => boolean;
}): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(input.directory);
  } catch (error) {
    // Nothing has been accepted on this data root; acceptance creates it.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const file = join(input.directory, entry);
    if (input.isActive(file)) continue;
    const deadline = entry.endsWith(".tmp")
      ? input.temporaryDeadline
      : input.deadline;
    try {
      if ((await stat(file)).mtimeMs > deadline) continue;
      await unlink(file);
    } catch (error) {
      // Another process collected the same file first: the goal is met.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
