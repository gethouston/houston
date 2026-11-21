import { isTauri } from "@tauri-apps/api/core";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { isCoLocatedEngine, newEngineActive } from "../../../lib/engine";
import type { Agent } from "../../../lib/types";

export interface LocalFilesAccess {
  osDir: string | undefined;
  canUseLocalFiles: boolean;
}

export function useLocalFilesAccess(agent: Agent): LocalFilesAccess {
  const desktop = isTauri();
  const { capabilities } = useCapabilities();
  const osDir =
    agent.localDir ?? (newEngineActive() ? undefined : agent.folderPath);
  const canUseLocalFiles =
    desktop &&
    isCoLocatedEngine() &&
    (capabilities?.revealInOs ?? true) &&
    osDir !== undefined;
  return { osDir, canUseLocalFiles };
}
