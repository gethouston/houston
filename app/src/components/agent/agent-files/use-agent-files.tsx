import type { FileEntry, FilesBrowserProps } from "@houston-ai/agent";
import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useFiles,
  useFileWrites,
  useUploadFiles,
} from "../../../hooks/queries";
import { useFilePreviewLoader } from "../../../hooks/use-file-preview-loader";
import { useMoveWithConflict } from "../../../hooks/use-move-with-conflict";
import { useOrgWriteLock } from "../../../hooks/use-org-write-lock";
import { useRenameWithConflict } from "../../../hooks/use-rename-with-conflict";
import { newEngineActive } from "../../../lib/engine";
import { tauriFiles } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import { MoveConflictDialog } from "../../move-conflict-dialog";
import { useFilesDeleteConfirm } from "../files-delete-confirm";
import { buildBrowserLabels, buildMenuLabels } from "../files-tab-labels";
import { buildUploadIntake } from "../files-upload-intake";
import { useFilesUploadPickers } from "../files-upload-pickers";
import { FilesUploadProgress } from "../files-upload-progress";
import { useLocalFilesAccess } from "./agent-files-capabilities";
import { useAgentFileDownloads } from "./agent-files-downloads";

export interface AgentFiles {
  entries?: FileEntry[];
  browserProps: FilesBrowserProps;
  actions: {
    upload?: () => void;
    uploadFolder?: () => void;
    reveal?: () => void;
    downloadAll?: () => void;
  };
  overlays: ReactNode;
  error: unknown;
  refetch: () => void;
  isFetching: boolean;
}

export function useAgentFiles(
  agent: Agent,
  options?: { enabled?: boolean },
): AgentFiles {
  const { t, i18n } = useTranslation("agents");
  const { osDir, canUseLocalFiles } = useLocalFilesAccess(agent);
  const setFilePreview = useUIStore((s) => s.setFilePreview);
  const browserLabels = buildBrowserLabels(t);
  const menuLabels = buildMenuLabels(t, canUseLocalFiles);
  const path = agent.folderPath;
  const loadPreview = useFilePreviewLoader(path);
  const {
    data: files,
    isLoading: loading,
    error,
    isFetching,
    refetch,
  } = useFiles(path, options?.enabled);
  const writes = useFileWrites(path);
  const requestRename = useRenameWithConflict(path, files);
  const uploadFiles = useUploadFiles(path);
  const move = useMoveWithConflict(path, files);
  const deleteConfirm = useFilesDeleteConfirm((selected) => {
    void writes.remove(selected.map((file) => file.path));
  });
  const { downloadFile, downloadFolder, downloadAll } = useAgentFileDownloads(
    path,
    agent.name,
  );
  const { ingest, onDropError } = buildUploadIntake(t, (picked, targetDir) =>
    uploadFiles.mutate({ files: picked, targetDir }),
  );
  const { pickFiles, pickFolder, inputs } = useFilesUploadPickers(ingest);
  const { locked } = useOrgWriteLock();
  const writable = !locked;
  const uploadFolder = writable && newEngineActive() ? pickFolder : undefined;

  const browserProps: FilesBrowserProps = {
    files: files ?? [],
    loading,
    uploading: uploadFiles.isPending,
    notice: <FilesUploadProgress progress={uploadFiles.progress} />,
    dragScope: agent.id,
    locale: i18n.language,
    loadPreview,
    onOpen: (file) =>
      canUseLocalFiles && osDir
        ? tauriFiles.open(osDir, file.path)
        : setFilePreview({
            agentPath: path,
            filePath: file.path,
            fileName: file.name,
            chat: null,
          }),
    onReveal:
      canUseLocalFiles && osDir
        ? (file) => tauriFiles.reveal(osDir, file.path)
        : undefined,
    onDownload: canUseLocalFiles ? undefined : downloadFile,
    onDownloadFolder: canUseLocalFiles ? undefined : downloadFolder,
    onDelete: writable ? deleteConfirm.requestDelete : undefined,
    onDeleteMany: writable ? deleteConfirm.requestDeleteMany : undefined,
    onRename: writable
      ? (file, newName) => requestRename(file.path, newName)
      : undefined,
    onCreateFolder: writable
      ? (name) => void writes.createFolder(name)
      : undefined,
    onFilesDropped: writable
      ? (dropped, targetFolder) => ingest(dropped, targetFolder ?? null)
      : undefined,
    onDropError,
    onMove: writable && newEngineActive() ? move.requestMove : undefined,
    labels: browserLabels,
    menuLabels,
    onUpload: writable ? pickFiles : undefined,
    onUploadFolder: uploadFolder,
  };
  const actions = {
    upload: writable ? pickFiles : undefined,
    uploadFolder,
    reveal:
      canUseLocalFiles && osDir
        ? () => tauriFiles.revealAgent(osDir)
        : undefined,
    downloadAll: canUseLocalFiles ? undefined : downloadAll,
  };

  const overlays = (
    <>
      {inputs}
      <MoveConflictDialog
        name={move.pending?.name ?? null}
        onReplace={move.replace}
        onKeepBoth={move.keepBoth}
        onCancel={move.cancel}
      />
      {deleteConfirm.dialog}
    </>
  );

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    entries: files,
    browserProps,
    actions,
    overlays,
    error,
    refetch: retry,
    isFetching,
  };
}
