export interface PodGatewayConfig {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  bootId: string;
  fence: { token?: string };
}

export function podGatewayUrl(gateway: PodGatewayConfig, path: string): string {
  return `${gateway.baseUrl.replace(/\/+$/, "")}${path}`;
}

export function podGatewayHeaders(
  gateway: PodGatewayConfig,
  opts: {
    write?: boolean;
    json?: boolean;
    extra?: Record<string, string>;
  } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${gateway.podToken}`,
    ...opts.extra,
  };
  if (opts.json) headers["Content-Type"] = "application/json";
  if (opts.write && gateway.fence.token !== undefined) {
    headers["X-Houston-Fencing-Token"] = gateway.fence.token;
    headers["X-Houston-Boot-Id"] = gateway.bootId;
  }
  return headers;
}

export function capturePodFence(
  gateway: PodGatewayConfig,
  response: Response,
): void {
  if (!response.ok) return;
  const token = response.headers.get("X-Houston-Fencing-Token");
  if (token) gateway.fence.token = token;
}
