import { isTauri } from "@tauri-apps/api/core";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { isCoLocatedEngine, newEngineActive } from "../../../lib/engine";
import type { Agent } from "../../../lib/types";

/**
 * Whether this deployment can hand a file to the OS, and which directory it
 * would hand it to. The ONE answer both Files surfaces gate on, so a web build
 * and a cloud pod can never end up offering "Reveal in Finder" on one screen
 * and "Download" on the other.
 */
export interface LocalFilesAccess {
  /** The directory the OS can open, or `undefined` when there is none. */
  osDir: string | undefined;
  /** OS open / reveal are available. When false the surface previews in-app
   *  and offers per-file Download plus Download all instead. */
  canUseLocalFiles: boolean;
}

export function useLocalFilesAccess(agent: Agent): LocalFilesAccess {
  // No OS to open/reveal with (web build, cloud pod, remote host): double-click
  // previews in-browser, the context menu offers Download, and the header's
  // secondary action becomes "Download all" instead of "Open in File Manager".
  const desktop = isTauri();
  const { capabilities } = useCapabilities();
  // The directory the OS can actually open: the host-reported real path (TS
  // engine, co-located hosts only), or the legacy engine's folderPath (already
  // absolute). On the TS engine folderPath is a route key, never a path —
  // handing it to the OS was HOU-677.
  const osDir =
    agent.localDir ?? (newEngineActive() ? undefined : agent.folderPath);
  const canUseLocalFiles =
    desktop &&
    isCoLocatedEngine() &&
    (capabilities?.revealInOs ?? true) &&
    osDir !== undefined;
  return { osDir, canUseLocalFiles };
}
