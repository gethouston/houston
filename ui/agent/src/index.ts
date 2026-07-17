// Types

// Hooks
export {
  INTERNAL_DRAG_TYPE,
  useDropZone,
  useFolderDropTarget,
} from "./drop-zone";
export type { FileMenuLabels } from "./file-menu";
export type { FileCategory } from "./file-type";
// File-type classification (shared with app-side preview loaders)
export {
  fileCategory,
  IMAGE_PREVIEW_MAX_BYTES,
  previewKind,
  TEXT_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_SLICE_BYTES,
} from "./file-type";
export type { FilesBrowserProps } from "./files-browser";
// Components
export { FilesBrowser } from "./files-browser";
export type { FilesBrowserLabels } from "./files-browser-labels";
export type { InstructionsPanelProps } from "./instructions-panel";
export { InstructionsPanel } from "./instructions-panel";
export type { FileNode, FolderNode, TreeNode } from "./tree";
export { buildTree, countFiles } from "./tree";
export type {
  FileEntry,
  FilePreviewData,
  FilesViewMode,
  InstructionFile,
  LoadFilePreview,
} from "./types";
export type { SortDirection, SortKey } from "./utils";
// Utilities
export { formatFileManagerDate, formatSize, getKind } from "./utils";
