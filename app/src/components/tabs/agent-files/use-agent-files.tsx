import type { FileEntry, FilesBrowserProps } from "@houston-ai/agent";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateFolder,
  useDeleteFile,
  useFiles,
  useRenameFile,
  useUploadFiles,
} from "../../../hooks/queries";
import { useFilePreviewLoader } from "../../../hooks/use-file-preview-loader";
import { useMoveWithConflict } from "../../../hooks/use-move-with-conflict";
import { newEngineActive } from "../../../lib/engine";
import { sharedBytesKey } from "../../../lib/file-bytes-cache";
import { tauriFiles } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import { FilePreviewDialog } from "../../file-preview-dialog";
import { MoveConflictDialog } from "../../move-conflict-dialog";
import { useFilesDeleteConfirm } from "../files-delete-confirm";
import { buildBrowserLabels, buildMenuLabels } from "../files-tab-labels";
import { buildUploadIntake } from "../files-upload-intake";
import { useFilesUploadPickers } from "../files-upload-pickers";
import { useLocalFilesAccess } from "./agent-files-capabilities";
import { useAgentFileDownloads } from "./agent-files-downloads";

/**
 * ONE agent's entire Files wiring: the read, every mutation, the capability
 * gates, the translated labels and the four overlays a Files surface needs.
 *
 * **Why it is a module and not a component.** TWO surfaces show an agent's
 * files, and there can only ever be one answer to "what happens when I rename
 * this file": the per-agent Files tab (`../files-tab.tsx`) and the team view's
 * Files section (`team-view/team-files/`). Copying the wiring would mean two
 * capability gates that can drift, two upload intakes, two delete confirms, two
 * move-conflict flows, and a bug fixed in one surface but not the other. So it
 * lives here once; `agent-files-surface.tsx` renders it, and both surfaces are
 * nothing but a frame around that (a tab pane, a team header band).
 *
 * **It is also what keeps the read cache-shared.** The tree comes from
 * `useFiles(agent.folderPath)` — query key `queryKeys.files(agentPath)` — so
 * both surfaces read the SAME cache entry, every mutation's invalidation lands
 * in one place, and `use-agent-invalidation.ts`'s `FilesChanged` →
 * `queryKeys.files(path)` refreshes whichever of them is on screen. There is no
 * second key and no cross-agent fan-out anywhere in the Files story.
 *
 * The hook returns props rather than rendering: `agent-files-surface.tsx` is
 * the one component that assembles them, and the two surfaces frame IT
 * differently while agreeing on every behaviour.
 */
export interface AgentFiles {
  /** Everything `FilesBrowser` needs, `rootLabel` included. Spread it. */
  browserProps: FilesBrowserProps;
  /** The hidden upload inputs + preview / move-conflict / delete dialogs.
   *  Render once, anywhere inside the surface. */
  overlays: ReactNode;
  /** `useFiles`' error, so the surface can SAY the read failed rather than
   *  showing a tree that is empty for an unexplained reason. */
  error: unknown;
  /** User-initiated retry of the read. */
  refetch: () => void;
  /** A read is in flight (initial or a retry) — disables a retry control. */
  isFetching: boolean;
}

export function useAgentFiles(agent: Agent): AgentFiles {
  const { t, i18n } = useTranslation("agents");
  const { osDir, canUseLocalFiles } = useLocalFilesAccess(agent);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const browserLabels = buildBrowserLabels(t);
  const menuLabels = buildMenuLabels(t, canUseLocalFiles);
  const path = agent.folderPath;
  const filesViewMode = useUIStore((s) => s.filesViewMode);
  const setFilesViewMode = useUIStore((s) => s.setFilesViewMode);
  const loadPreview = useFilePreviewLoader(path);
  const {
    data: files,
    isLoading: loading,
    error,
    isFetching,
    refetch,
  } = useFiles(path);
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
  const { downloadFile, downloadFolder, downloadAll } = useAgentFileDownloads(
    path,
    agent.name,
  );
  const { ingest, onDropError } = buildUploadIntake(t, (picked, targetDir) =>
    uploadFiles.mutate({ files: picked, targetDir }),
  );
  const { pickFiles, pickFolder, inputs } = useFilesUploadPickers(ingest);

  const browserProps: FilesBrowserProps = {
    files: files ?? [],
    loading,
    uploading: uploadFiles.isPending,
    view: filesViewMode,
    onViewChange: setFilesViewMode,
    rootLabel: agent.name,
    // The Modified column formats its dates in the user's language.
    locale: i18n.language,
    loadPreview,
    onOpen: (file) =>
      canUseLocalFiles && osDir
        ? tauriFiles.open(osDir, file.path)
        : setPreview(file),
    onReveal:
      canUseLocalFiles && osDir
        ? (file) => tauriFiles.reveal(osDir, file.path)
        : undefined,
    onDownload: canUseLocalFiles ? undefined : downloadFile,
    onDownloadFolder: canUseLocalFiles ? undefined : downloadFolder,
    onDelete: deleteConfirm.requestDelete,
    onDeleteMany: deleteConfirm.requestDeleteMany,
    onRename: (file, newName) =>
      renameFile.mutate({ relativePath: file.path, newName }),
    onCreateFolder: (name) => createFolder.mutate(name),
    onFilesDropped: (dropped, targetFolder) =>
      ingest(dropped, targetFolder ?? null),
    onDropError,
    // Drag-move needs the TS host's move route; the legacy engine has none.
    onMove: newEngineActive() ? move.requestMove : undefined,
    // An empty workspace has no open folder to land in: always the root.
    onBrowse: () => pickFiles(),
    emptyTitle: t("files.emptyTitle"),
    emptyDescription: t("files.emptyDescription"),
    labels: browserLabels,
    menuLabels,
    onUpload: pickFiles,
    // Folder structure needs the TS host's relPath-aware import route;
    // the legacy engine's import flattens everything to the root.
    onUploadFolder: newEngineActive() ? pickFolder : undefined,
    onRevealAgent:
      canUseLocalFiles && osDir
        ? () => tauriFiles.revealAgent(osDir)
        : undefined,
    onDownloadAll: canUseLocalFiles ? undefined : downloadAll,
  };

  const overlays = (
    <>
      {inputs}
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
    </>
  );

  // TanStack's refetch resolves with the query result and never rejects (a
  // failure lands back in `error`), so there is nothing here to catch.
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { browserProps, overlays, error, refetch: retry, isFetching };
}
