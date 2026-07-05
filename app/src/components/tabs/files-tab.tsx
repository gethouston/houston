import { type FileEntry, FilesBrowser } from "@houston-ai/agent";
import { isTauri } from "@tauri-apps/api/core";
import { Download, FolderOpen, Upload } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateFolder,
  useDeleteFile,
  useFiles,
  useMoveFile,
  useRenameFile,
  useUploadFiles,
} from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isCoLocatedEngine, newEngineActive } from "../../lib/engine";
import { saveBlob } from "../../lib/save-blob";
import { tauriFiles } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { FilePreviewDialog } from "./file-preview-dialog";

export default function FilesTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  // No OS to open/reveal with (web build, cloud pod, remote host): double-click
  // previews in-browser, the context menu offers Download, and the footer
  // becomes "Download all" instead of "Open in File Manager".
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
  const browserLabels = {
    columnName: t("files.columns.name"),
    columnDateModified: t("files.columns.dateModified"),
    columnDateCreated: t("files.columns.dateCreated"),
    columnSize: t("files.columns.size"),
    columnKind: t("files.columns.kind"),
    loading: t("files.loading"),
    browseFiles: t("files.browseFiles"),
  };
  const menuLabels = {
    open: canUseLocalFiles ? t("files.menu.open") : t("files.menu.preview"),
    rename: t("files.menu.rename"),
    reveal: t("files.menu.reveal"),
    download: t("files.menu.download"),
    delete: t("files.menu.delete"),
  };
  const path = agent.folderPath;
  const { data: files, isLoading: loading } = useFiles(path);
  const deleteFile = useDeleteFile(path);
  const renameFile = useRenameFile(path);
  const createFolder = useCreateFolder(path);
  const uploadFiles = useUploadFiles(path);
  const moveFile = useMoveFile(path);

  const downloadFile = (file: FileEntry) => {
    // call() already toasts + captures the failure; nothing more to surface.
    tauriFiles
      .download(path, file.path)
      .then(({ blob }) => saveBlob(file.name, blob))
      .catch(() => {});
  };
  const downloadAll = () => {
    tauriFiles
      .downloadArchive(path)
      .then(({ blob }) => saveBlob(`${agent.name} files.zip`, blob))
      .catch(() => {});
  };
  const pickFiles = () => fileInput.current?.click();

  return (
    <div className="h-full overflow-hidden p-4">
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.currentTarget.files ?? []);
          if (picked.length > 0) uploadFiles.mutate({ files: picked });
          e.currentTarget.value = ""; // allow re-picking the same file
        }}
      />
      <FilesBrowser
        files={files ?? []}
        loading={loading}
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
        onDelete={(file) => deleteFile.mutate(file.path)}
        onRename={(file, newName) =>
          renameFile.mutate({ relativePath: file.path, newName })
        }
        onCreateFolder={(name) => createFolder.mutate(name)}
        onFilesDropped={(dropped, targetFolder) =>
          uploadFiles.mutate({
            files: dropped,
            targetDir: targetFolder ?? null,
          })
        }
        onMove={
          // Drag-move needs the TS host's move route; the legacy engine has none.
          newEngineActive()
            ? (sourcePath, targetFolder) =>
                moveFile.mutate({
                  relativePath: sourcePath,
                  toDir: targetFolder,
                })
            : undefined
        }
        onBrowse={pickFiles}
        emptyTitle={t("files.emptyTitle")}
        emptyDescription={t("files.emptyDescription")}
        labels={browserLabels}
        menuLabels={menuLabels}
        statusBarAction={
          <div className="flex items-center gap-3">
            <FooterButton
              onClick={pickFiles}
              icon={<Upload className="size-3" />}
              label={t("files.uploadFiles")}
            />
            {canUseLocalFiles && osDir ? (
              <FooterButton
                onClick={() => tauriFiles.revealAgent(osDir)}
                icon={<FolderOpen className="size-3" />}
                label={t("files.openInFileManager")}
              />
            ) : (
              <FooterButton
                onClick={downloadAll}
                icon={<Download className="size-3" />}
                label={t("files.downloadAll")}
              />
            )}
          </div>
        }
      />
      <FilePreviewDialog
        agentPath={path}
        filePath={preview?.path ?? null}
        fileName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function FooterButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
