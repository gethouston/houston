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

/**
 * Whether an auth-walled MCP endpoint signs in with OAuth — judged by the
 * SAME discovery the sign-in flow runs, so "detect" and "Sign in" can never
 * disagree. The executor's own probe only guesses well-known paths and reads
 * a non-404 answer there as "no OAuth": a gateway that answers every unknown
 * path with 401 (Supabase Edge Functions, verified live with Spark Agency
 * Hub) made every such server read as "needs an API key", which the agent
 * then asked for in a loop. A discovery failure is an honest "not OAuth":
 * the key path stays the fallback.
 */
export async function advertisesOAuth(
  endpoint: string,
  fetchFn: typeof fetch,
  headers?: Record<string, string>,
): Promise<boolean> {
  try {
    const info = await discoverCustomOAuth(endpoint, fetchFn, headers);
    return info.authorizationServerMetadata !== undefined;
  } catch {
    return false;
  }
}
