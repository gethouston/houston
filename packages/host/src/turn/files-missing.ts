import type { HoustonEvent } from "@houston/protocol";
import type { Vfs } from "../vfs";
import { fileKey } from "./files-path";

/**
 * Why a workspace file read answered 404, in one host log line (PRODUCT-1780).
 *
 * The frontend treats "file not found" as the user's state (the agent linked a
 * file it never wrote, renamed, or deleted) and no longer reports it, so the
 * host log is the only place left to tell the candidates apart: a missing
 * SIBLING listing means the parent folder itself is absent (never written, or
 * the link points somewhere else); siblings present with the name missing
 * means a rename or delete; a `FilesChanged` seconds earlier means the write
 * raced the click. The clock below is fed by every event the host itself
 * emits (its own mutations and the local FS watcher); a runtime-relayed event
 * that bypasses the hub shows as "none seen".
 */

const lastFilesChanged = new Map<string, number>();

/** Record the moment an agent's files changed, as seen by this host process. */
export function noteFilesChanged(event: HoustonEvent, now = Date.now()): void {
  if (event.type === "FilesChanged") lastFilesChanged.set(event.agentPath, now);
}

/** Test seam: forget every recorded FilesChanged. */
export function resetFilesChangedClock(): void {
  lastFilesChanged.clear();
}

export interface MissingFileDiagnostic {
  rel: string;
  /** Names present in the parent folder, or null when the folder is absent. */
  siblings: string[] | null;
  /** Seconds since the last FilesChanged for this agent, or null when none. */
  filesChangedAgoS: number | null;
}

const SIBLING_SAMPLE = 5;

export async function describeMissingFile(
  vfs: Vfs,
  root: string,
  rel: string,
  agentId: string,
  now = Date.now(),
): Promise<MissingFileDiagnostic> {
  const slash = rel.lastIndexOf("/");
  const parent = slash === -1 ? root : fileKey(root, rel.slice(0, slash));
  const listed = await vfs.list(parent);
  const siblings =
    listed.length === 0
      ? null
      : listed
          .map((key) => key.slice(parent.length + 1).split("/")[0] ?? "")
          .filter((name, i, all) => name !== "" && all.indexOf(name) === i);
  const at = lastFilesChanged.get(agentId);
  return {
    rel,
    siblings,
    filesChangedAgoS: at === undefined ? null : Math.round((now - at) / 1000),
  };
}

export function formatMissingFile(d: MissingFileDiagnostic): string {
  const siblings =
    d.siblings === null
      ? "parent folder absent"
      : `${d.siblings.length} sibling(s): ${d.siblings.slice(0, SIBLING_SAMPLE).join(", ")}${d.siblings.length > SIBLING_SAMPLE ? ", …" : ""}`;
  const changed =
    d.filesChangedAgoS === null
      ? "no FilesChanged seen"
      : `last FilesChanged ${d.filesChangedAgoS}s ago`;
  return `[files] not found: ${d.rel} (${siblings}; ${changed})`;
}

/** The one-liner the 404 branches log. Never throws: a broken listing must not turn a 404 into a 500. */
export async function logMissingFile(
  vfs: Vfs,
  root: string,
  rel: string,
  agentId: string,
): Promise<void> {
  try {
    console.warn(
      formatMissingFile(await describeMissingFile(vfs, root, rel, agentId)),
    );
  } catch (err) {
    console.warn(
      `[files] not found: ${rel} (diagnostic listing failed: ${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
