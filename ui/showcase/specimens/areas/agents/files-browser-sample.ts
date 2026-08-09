import type { FileEntry } from "@houston-ai/agent";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * One agent's workspace on disk: two folders, a handful of files the agent
 * produced, and a couple it was given. Timestamps are fixed rather than
 * relative to now, so a screenshot of this page says the same thing tomorrow.
 */
const JULY_20 = Date.UTC(2026, 6, 20, 9, 14);
const JULY_24 = Date.UTC(2026, 6, 24, 16, 2);
const JULY_27 = Date.UTC(2026, 6, 27, 8, 41);

export const agentFiles: FileEntry[] = [
  {
    path: "receipts",
    name: "receipts",
    extension: "",
    size: 0,
    is_directory: true,
    dateModified: JULY_27,
    dateCreated: JULY_20,
  },
  {
    path: "receipts/flight-lisbon.pdf",
    name: "flight-lisbon.pdf",
    extension: "pdf",
    size: 184_320,
    dateModified: JULY_27,
    dateCreated: JULY_27,
  },
  {
    path: "receipts/hotel-porto.pdf",
    name: "hotel-porto.pdf",
    extension: "pdf",
    size: 96_100,
    dateModified: JULY_24,
    dateCreated: JULY_24,
  },
  {
    path: "reports",
    name: "reports",
    extension: "",
    size: 0,
    is_directory: true,
    dateModified: JULY_24,
    dateCreated: JULY_20,
  },
  {
    path: "reports/july-summary.md",
    name: "july-summary.md",
    extension: "md",
    size: 4_820,
    dateModified: JULY_24,
    dateCreated: JULY_24,
  },
  {
    path: "inbox-export.csv",
    name: "inbox-export.csv",
    extension: "csv",
    size: 1_204_000,
    dateModified: JULY_20,
    dateCreated: JULY_20,
  },
  {
    path: "team-photo.png",
    name: "team-photo.png",
    extension: "png",
    size: 2_310_400,
    dateModified: JULY_20,
    dateCreated: JULY_20,
  },
];

/** `FilesBrowserProps`, read off `ui/agent/src/files-browser.tsx`. */
export const FILES_BROWSER_PROPS: readonly SpecimenProp[] = [
  {
    name: "files",
    type: "FileEntry[]",
    note: "{ path, name, extension, size, is_directory?, dateModified?, dateCreated? }. A flat list — the browser builds the tree.",
  },
  {
    name: "loading",
    type: "boolean",
    note: "Swaps the body for the loading line; suppresses the empty state.",
  },
  {
    name: "loadPreview",
    type: "(file) => Promise<FilePreviewData | null>",
    note: "Lazily fetches preview bytes. Null falls back to the type icon.",
  },
  {
    name: "onOpen / onReveal / onDownload",
    type: "(file: FileEntry) => void",
    note: "Open, reveal in the OS file manager, or save to the machine. Each supplied callback adds its context-menu entry.",
  },
  {
    name: "onDownloadFolder",
    type: "(folder: FileEntry) => void",
    note: "Zips a subtree; adds a context menu to folder rows.",
  },
  {
    name: "onDelete / onRename",
    type: "(file, …) => void",
    note: "Context-menu delete and inline rename.",
  },
  {
    name: "onCreateFolder",
    type: "(name: string) => void",
    note: "Creates an inline root folder and supports the background context menu.",
  },
  {
    name: "onMove",
    type: "(sourcePath, targetFolder: string | null) => void",
    note: "Internal drag-and-drop. null = the workspace root.",
  },
  {
    name: "onFilesDropped / onDropError",
    type: "(files: File[], targetFolder?) => void / (error) => void",
    note: "External drops. Pass onDropError whenever onFilesDropped is set — the folder walk has nowhere else to throw.",
  },
  {
    name: "onUpload / onUploadFolder",
    type: "() => void",
    note: "Root upload actions used by the compact empty-folder hint.",
  },
  {
    name: "labels / menuLabels",
    type: "FilesBrowserLabels / FileMenuLabels",
    note: "Every chrome and context-menu string. English defaults.",
  },
];
