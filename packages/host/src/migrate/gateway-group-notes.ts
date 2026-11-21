import { getPreference, setPreference } from "@houston/domain";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

export const GATEWAY_NOTES_SWEPT_KEY = "gateway_group_notes_swept";

export function isEnginePod(opts: {
  gatewayFronted?: boolean;
  storeSync?: unknown;
  passive?: boolean;
}): boolean {
  return (
    opts.gatewayFronted === true &&
    opts.storeSync !== undefined &&
    opts.passive !== true
  );
}

export async function sweepGatewayGroupNotes(opts: {
  enginePod: boolean;
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  log: (message: string, error?: unknown) => void;
}): Promise<void> {
  const { enginePod, store, vfs, paths, log } = opts;
  if (!enginePod) return;
  try {
    for (const ws of await store.listWorkspaces()) {
      try {
        if (await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)) continue;
        let complete = true;
        for (const agent of await store.listAgents(ws.id)) {
          try {
            await vfs.deleteKey(`${paths.agentRoot(ws, agent)}/GROUP.md`);
          } catch (error) {
            complete = false;
            log(`[group-notes] ${agent.id}: GROUP.md removal failed`, error);
          }
        }
        if (complete)
          await setPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY, "1");
      } catch (error) {
        log(`[group-notes] ${ws.id}: GROUP.md sweep failed`, error);
      }
    }
  } catch (error) {
    log("[group-notes] workspace listing failed", error);
  }
}
