import type { ServerResponse } from "node:http";
import type { McpIntegrationProvider } from "../integrations/mcp/provider";

export interface McpCallbackDeps {
  providers: McpIntegrationProvider[];
  now?: () => number;
}

function html(res: ServerResponse, status: number, message: string): void {
  const safe = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>Houston</title></head><body><p>${safe}</p></body></html>`,
  );
}

export async function handleMcpOAuthCallback(
  deps: McpCallbackDeps | undefined,
  method: string,
  path: string,
  url: URL,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET" || path !== "/v1/integrations/mcp/callback") {
    return false;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !deps) {
    html(res, 400, "Invalid or expired authorization request.");
    return true;
  }

  let matched: McpIntegrationProvider | undefined;
  for (const provider of deps.providers) {
    if (await provider.claimAuthorization(state, deps.now?.() ?? Date.now())) {
      matched = provider;
      break;
    }
  }
  if (!matched) {
    html(res, 400, "Invalid or expired authorization request.");
    return true;
  }

  try {
    await matched.completeAuthorization(code);
    html(res, 200, "Connected. You can close this tab and return to Houston.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    html(res, 502, `Could not complete authorization: ${reason}`);
  }
  return true;
}
