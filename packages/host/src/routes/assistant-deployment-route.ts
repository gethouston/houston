import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import { safeSegment } from "./assistant-path-segments";

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
    (/^definitions\/[^/]+$/.test(rest) &&
      (request.method === "DELETE" || request.method === "PATCH"));
  const slug = deployment.gatewayAgentId;
  if (!allowed || !slug || !safeSegment(slug)) return null;
  return {
    ...request,
    path: `/agents/${encodeURIComponent(slug)}/integrations/custom/${rest}`,
  };
}
