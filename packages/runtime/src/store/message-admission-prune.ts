import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function pruneMessageAdmissions(input: {
  directory: string;
  deadline: number;
  temporaryDeadline: number;
  isActive: (file: string) => boolean;
}): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(input.directory);
  } catch (error) {
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
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
