import { normalizeActivities, parseJsonDoc } from "@houston/domain";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { type TurnFilesystem, turnActivityKey } from "./turn-filesystem";
import { readStoreText } from "./turn-store-read";

export interface ActivityDocSource {
  store: ObjectStore;
  prefix: string;
}

function activityDoc(raw: string, key: string) {
  return normalizeActivities(parseJsonDoc(raw, key), key).items;
}

export async function readStoredActivityDoc(
  source: ActivityDocSource,
  filesystem: TurnFilesystem,
) {
  const rel = turnActivityKey(filesystem.workspaceRel);
  try {
    const raw = await readStoreText(source, rel);
    if (raw !== null) return activityDoc(raw, rel);
    console.warn(
      '[turn] activity_doc_publish_skipped reason=stale_after_conflict read_failed="gone"',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[turn] activity_doc_publish_skipped reason=stale_after_conflict read_failed=${JSON.stringify(reason)}`,
    );
  }
  return undefined;
}
