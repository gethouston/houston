import type { FileEntry, FilesBrowserProps } from "@houston-ai/agent";
import { type ReactNode, useCallback, useState } from "react";
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
import { sharedBytesKey } from "../../../lib/file-bytes-cache";
import { tauriFiles } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
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
 * **Why it is a module and not a component.** There can only ever be one answer
 * to "what happens when I rename this file". Copying the wiring into a surface
 * would mean a second capability gate that can drift, a second upload intake, a
 * second delete confirm, a second move-conflict flow, and a bug fixed in one
 * place but not the other. So it lives here once; `agent-files-surface.tsx`
 * renders it, and the employee screen's Files section (`team-view/team-files/`) is
 * nothing but a frame around that.
 *
 * **It is also what keeps the read cache-shared.** The tree comes from
 * `useFiles(agent.folderPath)` — query key `queryKeys.files(agentPath)` — the
 * SAME cache entry every other files read uses, so every mutation's
 * invalidation lands in one place and `use-agent-invalidation.ts`'s
 * `FilesChanged` → `queryKeys.files(path)` refreshes whatever is on screen.
 * There is no second key and no cross-agent fan-out anywhere in the Files story.
 *
 * The hook returns props rather than rendering: `agent-files-surface.tsx` is
 * the one component that assembles them.
 */
export interface AgentFiles {
  /** Raw query data preserves "never read" as undefined for lazy team rows. */
  entries?: FileEntry[];
  /** Everything `FilesBrowser` needs. Spread it. */
  browserProps: FilesBrowserProps;
  actions: {
    /** Absent while the org is locked: it refuses every write. */
    upload?: () => void;
    uploadFolder?: () => void;
    reveal?: () => void;
    downloadAll?: () => void;
  };
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

export function useAgentFiles(
  agent: Agent,
  options?: { enabled?: boolean },
): AgentFiles {
  const { t, i18n } = useTranslation("agents");
  const { osDir, canUseLocalFiles } = useLocalFilesAccess(agent);
  const [preview, setPreview] = useState<FileEntry | null>(null);
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
  // The rows leave in the confirm's own frame; `remove` never rejects (a
  // refusal rolls back and tells the user), so nothing here can go quiet.
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
  // A locked org refuses every write; reading, opening and downloading stay.
  const { locked } = useOrgWriteLock();
  const writable = !locked;
  const uploadFolder = writable && newEngineActive() ? pickFolder : undefined;

  const browserProps: FilesBrowserProps = {
    files: files ?? [],
    loading,
    uploading: uploadFiles.isPending,
    dragScope: agent.id,
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
    // Drag-move needs the TS host's move route; the legacy engine has none.
    onMove: writable && newEngineActive() ? move.requestMove : undefined,
    labels: browserLabels,
    menuLabels,
    onUpload: writable ? pickFiles : undefined,
    // Folder structure needs the TS host's relPath-aware import route;
    // the legacy engine's import flattens everything to the root.
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
        onReplace={move.replace}
        onKeepBoth={move.keepBoth}
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
