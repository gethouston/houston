import {
  discoverOAuthServerInfo,
  extractWWWAuthenticateParams,
} from "@modelcontextprotocol/sdk/client/auth.js";

/** Preserve working well-known discovery before trying a server-advertised URL. */
export async function discoverCustomOAuth(
  endpoint: string,
  fetchFn: typeof fetch,
  headers?: Record<string, string>,
): Promise<Awaited<ReturnType<typeof discoverOAuthServerInfo>>> {
  const info = await discoverOAuthServerInfo(endpoint, { fetchFn });
  if (info.resourceMetadata || info.authorizationServerMetadata) return info;

  // The SDK helper only guesses well-known paths; it does not request the MCP
  // endpoint to obtain its RFC 9728 WWW-Authenticate resource_metadata hint.
  const response = await fetchFn(endpoint, {
    headers: { ...headers, Accept: "application/json, text/event-stream" },
    signal: AbortSignal.timeout(10_000),
  });
  const { resourceMetadataUrl } =
    response.status === 401 ? extractWWWAuthenticateParams(response) : {};
  // A GET may open an SSE stream. Only the challenge headers are needed.
  await response.body?.cancel();
  if (!resourceMetadataUrl) return info;

  return discoverOAuthServerInfo(endpoint, { fetchFn, resourceMetadataUrl });
}
