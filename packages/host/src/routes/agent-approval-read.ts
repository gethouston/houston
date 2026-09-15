import { approvalPresentation } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";
import { json } from "./http";
import { defineRouteFamily } from "./registry";

/**
 * One pending assistant approval, read back on the authenticated shell surface
 * (never the sandbox router). BOTH spellings are live and always have been —
 * the app addresses the gateway's versioned surface, the desktop the bare one —
 * so they are two routes over one handler rather than a permissive regex.
 */
defineRouteFamily({
  group: "agent-approvals",
  members: [
    { method: "GET", path: "/agents/:agentId/approvals/:requestId" },
    { method: "GET", path: "/v1/agents/:agentId/approvals/:requestId" },
  ],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/agent-approval-read.ts",
  handler: ({ authz, params, res }) => {
    const request = assistantApprovals.pending(
      params.requestId ?? "",
      authz.agent.id,
    );
    if (request) json(res, 200, approvalPresentation(request));
    else json(res, 404, { error: "approval not found" });
  },
});
