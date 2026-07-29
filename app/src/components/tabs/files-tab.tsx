import { type FileEntry, FilesBrowser } from "@houston-ai/agent";
import { isTauri } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateFolder,
  useDeleteFile,
  useFiles,
  useRenameFile,
  useUploadFiles,
} from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useFilePreviewLoader } from "../../hooks/use-file-preview-loader";
import { useMoveWithConflict } from "../../hooks/use-move-with-conflict";
import { useSaveDownload } from "../../hooks/use-save-download";
import { isCoLocatedEngine, newEngineActive } from "../../lib/engine";
import { sharedBytesKey } from "../../lib/file-bytes-cache";
import { tauriFiles } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { FilePreviewDialog } from "../file-preview-dialog";
import { MoveConflictDialog } from "../move-conflict-dialog";
import { useFilesDeleteConfirm } from "./files-delete-confirm";
import { buildBrowserLabels, buildMenuLabels } from "./files-tab-labels";
import { buildUploadIntake } from "./files-upload-intake";
import { useFilesUploadPickers } from "./files-upload-pickers";

export default function FilesTab({ agent }: TabProps) {
  const { t, i18n } = useTranslation("agents");
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
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const browserLabels = buildBrowserLabels(t);
  const menuLabels = buildMenuLabels(t, canUseLocalFiles);
  const path = agent.folderPath;
  const filesViewMode = useUIStore((s) => s.filesViewMode);
  const setFilesViewMode = useUIStore((s) => s.setFilesViewMode);
  const loadPreview = useFilePreviewLoader(path);
  const { data: files, isLoading: loading } = useFiles(path);
  const deleteFile = useDeleteFile(path);
  const renameFile = useRenameFile(path);
  const createFolder = useCreateFolder(path);
  const uploadFiles = useUploadFiles(path);
  const move = useMoveWithConflict(path, files);
  // One mutation call per file, deliberately: `useDeleteFile` routes through
  // `call`, which toasts + reports every failure on its own, so a batch where
  // the third file fails still tells the user about that third file instead of
  // one aggregate promise swallowing it. Nothing here catches or awaits, so
  // there is no place for a rejection to go quiet.
  const deleteConfirm = useFilesDeleteConfirm((selected) => {
    for (const file of selected) deleteFile.mutate(file.path);
  });

  // save() surfaces its own success/failure toasts and never rejects; the
  // empty catch below only silences the fetch failure call() already toasted.
  const save = useSaveDownload();
  const downloadFile = (file: FileEntry) => {
    tauriFiles
      .download(path, file.path)
      .then(({ blob }) => save(file.name, blob))
      .catch(() => {});
  };
  const downloadFolder = (folder: FileEntry) => {
    tauriFiles
      .downloadArchive(path, folder.path)
      .then(({ blob }) => save(`${folder.name}.zip`, blob))
      .catch(() => {});
  };
  const downloadAll = () => {
    tauriFiles
      .downloadArchive(path)
      .then(({ blob }) => save(`${agent.name} files.zip`, blob))
      .catch(() => {});
  };
  const { ingest, onDropError } = buildUploadIntake(t, (picked, targetDir) =>
    uploadFiles.mutate({ files: picked, targetDir }),
  );
  const { pickFiles, pickFolder, inputs } = useFilesUploadPickers(ingest);

  return (
    <div className="flex h-full flex-col">
      {inputs}
      <FilesBrowser
        files={files ?? []}
        loading={loading}
        uploading={uploadFiles.isPending}
        view={filesViewMode}
        onViewChange={setFilesViewMode}
        rootLabel={agent.name}
        // The Modified column formats its dates in the user's language.
        locale={i18n.language}
        loadPreview={loadPreview}
        onOpen={(file) =>
          canUseLocalFiles && osDir
            ? tauriFiles.open(osDir, file.path)
            : setPreview(file)
        }
        onReveal={
          canUseLocalFiles && osDir
            ? (file) => tauriFiles.reveal(osDir, file.path)
            : undefined
        }
        onDownload={canUseLocalFiles ? undefined : downloadFile}
        onDownloadFolder={canUseLocalFiles ? undefined : downloadFolder}
        onDelete={deleteConfirm.requestDelete}
        onDeleteMany={deleteConfirm.requestDeleteMany}
        onRename={(file, newName) =>
          renameFile.mutate({ relativePath: file.path, newName })
        }
        onCreateFolder={(name) => createFolder.mutate(name)}
        onFilesDropped={(dropped, targetFolder) =>
          ingest(dropped, targetFolder ?? null)
        }
        onDropError={onDropError}
        onMove={
          // Drag-move needs the TS host's move route; the legacy engine has none.
          newEngineActive() ? move.requestMove : undefined
        }
        // An empty workspace has no open folder to land in: always the root.
        onBrowse={() => pickFiles()}
        emptyTitle={t("files.emptyTitle")}
        emptyDescription={t("files.emptyDescription")}
        labels={browserLabels}
        menuLabels={menuLabels}
        onUpload={pickFiles}
        onUploadFolder={
          // Folder structure needs the TS host's relPath-aware import route;
          // the legacy engine's import flattens everything to the root.
          newEngineActive() ? pickFolder : undefined
        }
        onRevealAgent={
          canUseLocalFiles && osDir
            ? () => tauriFiles.revealAgent(osDir)
            : undefined
        }
        onDownloadAll={canUseLocalFiles ? undefined : downloadAll}
      />
      <FilePreviewDialog
        agentPath={path}
        filePath={preview?.path ?? null}
        fileName={preview?.name ?? ""}
        // Same cache key the grid thumbnail used, so a previewed file opens
        // from memory instead of downloading its bytes twice. Undefined for
        // anything the grid never thumbnails, which then streams straight
        // through instead of being held in the cache.
        bytesCacheKey={preview ? sharedBytesKey(preview) : undefined}
        onClose={() => setPreview(null)}
      />
      <MoveConflictDialog
        name={move.pending?.name ?? null}
        onReplace={() => void move.replace()}
        onKeepBoth={() => void move.keepBoth()}
        onCancel={move.cancel}
      />
      {deleteConfirm.dialog}
    </div>
  );
}
