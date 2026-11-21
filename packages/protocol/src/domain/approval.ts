export type ApprovalDecision = "approve" | "deny";

export interface MessageApproval {
  requestId: string;
  decision: ApprovalDecision;
}

export function parseMessageApprovals(value: unknown): MessageApproval[] {
  if (!Array.isArray(value)) return [];
  const approvals: MessageApproval[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { requestId, decision } = entry as {
      requestId?: unknown;
      decision?: unknown;
    };
    if (typeof requestId !== "string" || requestId === "") continue;
    if (decision !== "approve" && decision !== "deny") continue;
    approvals.push({ requestId, decision });
  }
  return approvals;
}

export interface ApprovalArg {
  name: string;
  value: string;
  long: boolean;
  truncated?: number;
}

export interface ApprovalPresentation {
  title: string;
  detail?: string;
  args: ApprovalArg[];
  options: {
    kind: "approval";
    id: "approve" | "decline";
    label: string;
  }[];
  operation: string;
  expiresAt: number;
}
