import { type FileEntry, FilesBrowser } from "@houston-ai/agent";
import { isTauri } from "@tauri-apps/api/core";
import type { InputHTMLAttributes } from "react";
import { useRef, useState } from "react";
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
import { tauriFiles } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { FilePreviewDialog } from "../file-preview-dialog";
import { MoveConflictDialog } from "../move-conflict-dialog";
import { buildBrowserLabels, buildMenuLabels } from "./files-tab-labels";
import { buildUploadIntake } from "./files-upload-intake";

// Non-standard attribute (WebKit lineage, supported by every engine we ship
// on): turns the picker into a directory picker. Unknown to React's typings,
// hence the cast; engines without it fall back to a plain file picker.
const FOLDER_INPUT_PROPS = {
  webkitdirectory: "",
} as InputHTMLAttributes<HTMLInputElement>;

export default function FilesTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
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
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
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
  const pickFiles = () => fileInput.current?.click();
  const pickFolder = () => folderInput.current?.click();
  const { ingest, onDropError } = buildUploadIntake(t, (picked, targetDir) =>
    uploadFiles.mutate({ files: picked, targetDir }),
  );

  return (
    <div className="flex h-full flex-col">
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          ingest(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = ""; // allow re-picking the same file
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          ingest(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = ""; // allow re-picking the same folder
        }}
        {...FOLDER_INPUT_PROPS}
      />
      <FilesBrowser
        files={files ?? []}
        loading={loading}
        view={filesViewMode}
        onViewChange={setFilesViewMode}
        rootLabel={agent.name}
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
        onDelete={(file) => deleteFile.mutate(file.path)}
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
        onBrowse={pickFiles}
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
        onClose={() => setPreview(null)}
      />
      <MoveConflictDialog
        name={move.pending?.name ?? null}
        onReplace={() => void move.replace()}
        onKeepBoth={() => void move.keepBoth()}
        onCancel={move.cancel}
      />
    </div>
  );
}
