import {
  discoverOAuthServerInfo,
  extractWWWAuthenticateParams,
} from "@modelcontextprotocol/sdk/client/auth.js";

export async function discoverCustomOAuth(
  endpoint: string,
  fetchFn: typeof fetch,
  headers?: Record<string, string>,
): Promise<Awaited<ReturnType<typeof discoverOAuthServerInfo>>> {
  const info = await discoverOAuthServerInfo(endpoint, { fetchFn });
  if (info.resourceMetadata || info.authorizationServerMetadata) return info;

  const response = await fetchFn(endpoint, {
    headers: { ...headers, Accept: "application/json, text/event-stream" },
    signal: AbortSignal.timeout(10_000),
  });
  const { resourceMetadataUrl } =
    response.status === 401 ? extractWWWAuthenticateParams(response) : {};
  await response.body?.cancel();
  if (!resourceMetadataUrl) return info;

  return discoverOAuthServerInfo(endpoint, { fetchFn, resourceMetadataUrl });
}

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
