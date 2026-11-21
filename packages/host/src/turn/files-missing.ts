import type { HoustonEvent } from "@houston/protocol";
import type { Vfs } from "../vfs";
import { fileKey } from "./files-path";

const lastFilesChanged = new Map<string, number>();

export function noteFilesChanged(event: HoustonEvent, now = Date.now()): void {
  if (event.type === "FilesChanged") lastFilesChanged.set(event.agentPath, now);
}

export function resetFilesChangedClock(): void {
  lastFilesChanged.clear();
}

export interface MissingFileDiagnostic {
  rel: string;
  siblings: string[] | null;
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
