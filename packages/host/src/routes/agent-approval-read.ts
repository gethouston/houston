import type { ServerResponse } from "node:http";
import { approvalPresentation } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";
import type { UserId } from "../domain/types";
import { type AgentRouteDeps, authorizeAgent } from "./agent-authz";
import { json } from "./http";

/** Mounted on the authenticated shell surface, never the sandbox router. */
export async function handleApprovalRead(
  deps: AgentRouteDeps,
  userId: UserId,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(/^\/(?:v1\/)?agents\/([^/]+)\/approvals\/([^/]+)$/);
  if (method !== "GET" || !match) return false;
  const agentId = decodeURIComponent(match[1] ?? "");
  const authz = await authorizeAgent(deps, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }
  const request = assistantApprovals.pending(
    decodeURIComponent(match[2] ?? ""),
    agentId,
  );
  if (request) json(res, 200, approvalPresentation(request));
  else json(res, 404, { error: "approval not found" });
  return true;
}
