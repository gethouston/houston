import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import { safeSegment } from "./assistant-path-segments";

/** Applied only after catalog authorization and approval. Custom definitions
 * live on the owning pod; the gateway's root integrations surface is Composio.
 * The scoped mount uses the same user-global manager as the UI's secure card. */
export function assistantDeploymentRoute(
  request: AssistantUpstreamRequest,
  deployment: { gatewayFronted?: boolean; gatewayAgentId?: string },
): AssistantUpstreamRequest | null {
  const prefix = "/v1/integrations/custom/";
  if (!deployment.gatewayFronted || !request.path.startsWith(prefix)) {
    return request;
  }
  const rest = request.path.slice(prefix.length);
  const allowed =
    (rest === "definitions" &&
      (request.method === "GET" || request.method === "POST")) ||
    (rest === "detect" && request.method === "POST") ||
    (/^definitions\/[^/]+\/tools$/.test(rest) && request.method === "GET") ||
    (/^definitions\/[^/]+$/.test(rest) && request.method === "DELETE");
  const slug = deployment.gatewayAgentId;
  if (!allowed || !slug || !safeSegment(slug)) return null;
  return {
    ...request,
    path: `/agents/${encodeURIComponent(slug)}/integrations/custom/${rest}`,
  };
}
