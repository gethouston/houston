import {
  loadPreferences,
  prefDocKey,
  saveJson,
  withDocLock,
} from "@houston/domain";
import { normalizeSidebarLayout, type SidebarLayout } from "@houston/protocol";
import type { Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import {
  LEGACY_NOTES_KEY,
  legacyNotesOf,
  parseLegacyNotes,
  removeLegacyNotes,
} from "./sidebar-layout-notes";

const LAYOUT_KEY = "sidebar_layout";

/**
 * The v2 layout a stored document converts to, or null when the value is not
 * a document at all. Legacy and malformed documents are normalized rather
 * than rejected: every group they still name survives the conversion.
 */
export function migrateStoredSidebarLayout(raw: unknown): SidebarLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeSidebarLayout(raw);
}

/** Convert the stored layout, recording its legacy notes in the SAME write. */
function convertLayout(vfs: Vfs, ws: Workspace): Promise<void> {
  return withDocLock(prefDocKey(ws.id), async () => {
    const prefs = await loadPreferences(vfs, ws.id);
    const raw = prefs[LAYOUT_KEY];
    if (!raw) return;
    const stored: unknown = JSON.parse(raw);
    const layout = migrateStoredSidebarLayout(stored);
    if (!layout) return;
    const next = JSON.stringify(layout);
    if (next === JSON.stringify(stored)) return;
    const notes = legacyNotesOf(stored);
    await saveJson(vfs, prefDocKey(ws.id), {
      ...prefs,
      [LAYOUT_KEY]: next,
      ...(notes ? { [LEGACY_NOTES_KEY]: JSON.stringify(notes) } : {}),
    });
  });
}

/** Clear the marker unless a newer conversion replaced it meanwhile. */
function clearMarker(vfs: Vfs, ws: Workspace, marker: string): Promise<void> {
  return withDocLock(prefDocKey(ws.id), async () => {
    const prefs = await loadPreferences(vfs, ws.id);
    if (prefs[LEGACY_NOTES_KEY] !== marker) return;
    const { [LEGACY_NOTES_KEY]: _done, ...rest } = prefs;
    await saveJson(vfs, prefDocKey(ws.id), rest);
  });
}

/**
 * Convert every stored layout to v2, then remove the GROUP.md notes a legacy
 * layout mirrored. Pending removals persist in the preferences document until
 * they all succeed, so an interrupted boot finishes on the next one.
 */
export async function migrateSidebarLayout(opts: {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  log: (message: string, error?: unknown) => void;
}): Promise<void> {
  const { store, vfs, paths, log } = opts;
  for (const ws of await store.listWorkspaces()) {
    try {
      await convertLayout(vfs, ws);
    } catch (error) {
      log(`[sidebar-layout] ${ws.id}: preference migration failed`, error);
    }
    try {
      const marker = (await loadPreferences(vfs, ws.id))[LEGACY_NOTES_KEY];
      if (!marker) continue;
      const notes = parseLegacyNotes(marker);
      if (await removeLegacyNotes({ store, vfs, paths, ws, notes, log }))
        await clearMarker(vfs, ws, marker);
    } catch (error) {
      log(`[sidebar-layout] ${ws.id}: group note removal failed`, error);
    }
  }
}
