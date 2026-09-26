import { getPreference, setPreference } from "@houston/domain";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

/**
 * Cloud engine pods hydrate a GROUP.md at every agent root that the hosted
 * gateway wrote from a team's shared context. Nothing writes or reads those
 * files any more, so the pod deletes them once per workspace; the store sync
 * uploads the removal. The marker makes the sweep one-shot: a GROUP.md someone
 * writes afterwards is theirs and stays.
 */
export const GATEWAY_NOTES_SWEPT_KEY = "gateway_group_notes_swept";

/**
 * Only the gateway-fronted engine pod hydrates from the gateway's object store,
 * so only it can hold a gateway-written GROUP.md. Desktop and self-host have no
 * managed store, and a GROUP.md there is the person's own file.
 */
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

/**
 * Delete every agent's GROUP.md in each workspace not yet swept. Never throws:
 * a failure is logged per agent (or per workspace), leaves the marker unset,
 * and is retried on the next boot.
 */
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
