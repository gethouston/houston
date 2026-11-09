import type { CreateFlowDoor } from "../../components/shell/create-agent-steps-model.ts";

export interface CreateFlowRequest {
  door: CreateFlowDoor;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: { label: string; onClick: () => void };
  /** How many identical firings this toast represents (coalesced repeats). */
  count?: number;
}

/** A workspace file shown in the preview panel (chat file cards, turn
 *  summaries, prose file links, the Files tab). */
export interface FilePreviewTarget {
  /** The agent's `folderPath` (route key / directory, per engine). */
  agentPath: string;
  /** Workspace-relative path of the file. */
  filePath: string;
  fileName: string;
  /** The conversation comments on this file go to (its draft key), or null
   *  when it was opened outside a chat (the Files tab), where commenting is
   *  off. */
  chat: { draftKey: string } | null;
  /** Open on this page (a sent comment's pill), rather than the first. */
  page?: number;
}
