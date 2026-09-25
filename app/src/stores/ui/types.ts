import type { CreateFlowDoor } from "../../components/shell/create-agent-steps-model.ts";

/**
 * A request to open the create sheet: the door the caller pressed, and the
 * team an AI employee made through it should land in (`null` = the default
 * team). The sheet resolves the door against what this caller may actually
 * create (`create-agent-steps-model.ts`).
 */
export interface CreateFlowRequest {
  door: CreateFlowDoor;
  teamId: string | null;
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

/** A workspace file queued for the global in-app preview dialog (chat file
 * cards, turn summaries, prose file pills — HOU: preview files from chat). */
export interface FilePreviewTarget {
  /** The agent's `folderPath` (route key / directory, per engine). */
  agentPath: string;
  /** Workspace-relative path of the file. */
  filePath: string;
  fileName: string;
}
