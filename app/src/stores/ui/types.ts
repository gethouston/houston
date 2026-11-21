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
  count?: number;
}

export interface FilePreviewTarget {
  agentPath: string;
  filePath: string;
  fileName: string;
  chat: { draftKey: string } | null;
  page?: number;
}
