import { type Zippable, zipSync } from "fflate";
import type { Vfs } from "../vfs";
import { FileOpError, fileKey, listWorkspace } from "./files-ops";

/**
 * Zip the agent's visible workspace files — the Files tab's "Download all"
 * (whole workspace) and per-folder Download on deployments with no local OS
 * to reveal a folder in (cloud pods, web builds, desktop → remote host).
 * Same visibility rules as the listing (`listWorkspace`): internal dot-dirs and
 * `.keep` markers never land in the archive. STORE-only (level 0): the
 * deliverables agents produce (pdf/docx/xlsx/png) are already compressed, and a
 * predictable fast pass beats squeezing bytes on the host's event loop.
 */

/** Refuse absurd archives rather than buffering them in host memory. */
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

// Zip can only encode 1980–2099 mtimes; anything else (backends with synthetic
// counters, files with bogus clocks) is omitted rather than crashing the zip.
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
  // Zip a folder the way Finder does: the folder itself is the archive's root
  // entry, so entry names are relative to the folder's PARENT.
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
    if (buf === null) continue; // deleted mid-archive — skip it, don't fail the download
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
