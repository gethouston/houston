import { type FileEntry, FilesBrowser } from "@houston-ai/agent";
import { isTauri } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateFolder,
  useDeleteFile,
  useFiles,
  useRenameFile,
} from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { saveBlob } from "../../lib/save-blob";
import { tauriFiles } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { FilePreviewDialog } from "./file-preview-dialog";

export default function FilesTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  // Web build: no OS to open/reveal with — double-click previews in-browser,
  // the context menu offers Download, and the file-manager footer goes away.
  const desktop = isTauri();
  const { capabilities } = useCapabilities();
  const canUseLocalFiles = desktop && (capabilities?.revealInOs ?? true);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const browserLabels = {
    columnName: t("files.columns.name"),
    columnDateModified: t("files.columns.dateModified"),
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

  const downloadFile = (file: FileEntry) => {
    // call() already toasts + captures the failure; nothing more to surface.
    tauriFiles
      .download(path, file.path)
      .then(({ blob }) => saveBlob(file.name, blob))
      .catch(() => {});
  };

  return (
    <div className="h-full overflow-hidden p-4">
      <FilesBrowser
        files={files ?? []}
        loading={loading}
        onOpen={(file) =>
          canUseLocalFiles ? tauriFiles.open(path, file.path) : setPreview(file)
        }
        onReveal={
          canUseLocalFiles
            ? (file) => tauriFiles.reveal(path, file.path)
            : undefined
        }
        onDownload={canUseLocalFiles ? undefined : downloadFile}
        onDelete={(file) => deleteFile.mutate(file.path)}
        onRename={(file, newName) =>
          renameFile.mutate({ relativePath: file.path, newName })
        }
        onCreateFolder={(name) => createFolder.mutate(name)}
        emptyTitle={t("files.emptyTitle")}
        emptyDescription={t("files.emptyDescription")}
        labels={browserLabels}
        menuLabels={menuLabels}
        statusBarAction={
          canUseLocalFiles ? (
            <button
              type="button"
              onClick={() => tauriFiles.revealAgent(path)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="size-3" />
              {t("files.openInFileManager")}
            </button>
          ) : undefined
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
