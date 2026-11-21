import type { FileEntry } from "@houston-ai/agent";
import { useSaveDownload } from "../../../hooks/use-save-download";
import { tauriFiles } from "../../../lib/tauri";

export interface AgentFileDownloads {
  downloadFile: (file: FileEntry) => void;
  downloadFolder: (folder: FileEntry) => void;
  downloadAll: () => void;
}

export function useAgentFileDownloads(
  agentPath: string,
  agentName: string,
): AgentFileDownloads {
  const save = useSaveDownload();
  return {
    downloadFile: (file) => {
      tauriFiles
        .download(agentPath, file.path)
        .then(({ blob }) => save(file.name, blob))
        .catch(() => {});
    },
    downloadFolder: (folder) => {
      tauriFiles
        .downloadArchive(agentPath, folder.path)
        .then(({ blob }) => save(`${folder.name}.zip`, blob))
        .catch(() => {});
    },
    downloadAll: () => {
      tauriFiles
        .downloadArchive(agentPath)
        .then(({ blob }) => save(`${agentName} files.zip`, blob))
        .catch(() => {});
    },
  };
}
