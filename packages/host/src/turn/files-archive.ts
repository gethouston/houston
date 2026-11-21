import { type Zippable, zipSync } from "fflate";
import type { Vfs } from "../vfs";
import { FileOpError, fileKey, listWorkspace } from "./files-ops";

export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

const ZIP_MTIME_MIN = Date.UTC(1980, 0, 2);
const ZIP_MTIME_MAX = Date.UTC(2099, 0, 1);

export async function archiveWorkspace(
  vfs: Vfs,
  root: string,
  folder?: string,
): Promise<Buffer> {
  const all = (await listWorkspace(vfs, root)).filter((f) => !f.is_directory);
  const files = folder
    ? all.filter((f) => f.path.startsWith(`${folder}/`))
    : all;
  if (files.length === 0) throw new FileOpError(404, "no files to download");
  const base = folder ? folder.slice(0, folder.lastIndexOf("/") + 1) : "";
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_ARCHIVE_BYTES) {
    throw new FileOpError(
      413,
      "the agent's files are too large to download as one archive",
    );
  }
  const entries: Zippable = {};
  for (const f of files) {
    const buf = await vfs.readBytes(fileKey(root, f.path));
    if (buf === null) continue;
    const mtime = f.date_modified;
    const validMtime =
      mtime !== undefined && mtime >= ZIP_MTIME_MIN && mtime <= ZIP_MTIME_MAX;
    entries[f.path.slice(base.length)] = [
      new Uint8Array(buf),
      { level: 0, ...(validMtime ? { mtime } : {}) },
    ];
  }
  return Buffer.from(zipSync(entries));
}
