import type { FileEntry } from "@houston-ai/agent";
import { useSaveDownload } from "../../../hooks/use-save-download";
import { tauriFiles } from "../../../lib/tauri";

/**
 * The three "save it to my machine" paths a Files surface offers when the OS
 * cannot open the file itself (web build, cloud pod, remote host): one file,
 * one folder as a zip, the whole workspace as a zip.
 *
 * Extracted from `use-agent-files.tsx` only to keep that module inside the
 * 200-line limit — it is the same code, still used by exactly one caller.
 */
export interface AgentFileDownloads {
  downloadFile: (file: FileEntry) => void;
  downloadFolder: (folder: FileEntry) => void;
  downloadAll: () => void;
}

export function useAgentFileDownloads(
  agentPath: string,
  agentName: string,
): AgentFileDownloads {
  // save() surfaces its own success/failure toasts and never rejects; the
  // empty catch below only silences the fetch failure call() already toasted.
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
