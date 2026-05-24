import { useTranslation } from "react-i18next";
import { FilesBrowser } from "@houston-ai/agent";
import { FolderOpen } from "lucide-react";
import {
  useFiles,
  useDeleteFile,
  useRenameFile,
  useCreateFolder,
} from "../../hooks/queries";
import { tauriFiles } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";

export default function FilesTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const browserLabels = {
    columnName: t("files.columns.name"),
    columnDateModified: t("files.columns.dateModified"),
    columnSize: t("files.columns.size"),
    columnKind: t("files.columns.kind"),
    loading: t("files.loading"),
    browseFiles: t("files.browseFiles"),
  };
  const menuLabels = {
    open: t("files.menu.open"),
    rename: t("files.menu.rename"),
    reveal: t("files.menu.reveal"),
    delete: t("files.menu.delete"),
  };
  const path = agent.folderPath;
  const { data: files, isLoading: loading } = useFiles(path);
  const deleteFile = useDeleteFile(path);
  const renameFile = useRenameFile(path);
  const createFolder = useCreateFolder(path);

  return (
    <div className="h-full overflow-hidden p-4">
      <FilesBrowser
        files={files ?? []}
        loading={loading}
        onOpen={(file) => tauriFiles.open(path, file.path)}
        onReveal={(file) => tauriFiles.reveal(path, file.path)}
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
          <button
            onClick={() => tauriFiles.revealAgent(path)}
            className="flex items-center gap-1 text-[11px] text-[#6d6d6d] hover:text-[#0d0d0d] transition-colors"
          >
            <FolderOpen className="size-3" />
            {t("files.openInFileManager")}
          </button>
        }
      />
    </div>
  );
}
