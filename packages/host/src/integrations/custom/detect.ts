import type { CustomExecutor } from "./executor-host";
import { guardedFetch } from "./fetch-guard";
import { advertisesOAuth } from "./oauth-discovery";
import { slugify } from "./slug";

export interface DetectResult {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  requiresAuthentication?: boolean;
  requiresOAuth?: boolean;
  oauthSupported?: boolean;
  toolCount?: number;
}

export async function detectSource(
  executor: CustomExecutor,
  url: string,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<DetectResult> {
  const detected = await executor.integrations.detect(url).catch(() => []);
  const first = detected[0];
  if (first?.kind === "openapi") {
    return {
      kind: "openapi",
      name: first.name,
      suggestedSlug: slugify(first.slug ?? first.name ?? url),
    };
  }
  try {
    const probe = await executor.mcp.probeEndpoint(url);
    const requiresOAuth =
      probe.requiresOAuth ||
      (probe.requiresAuthentication &&
        (await advertisesOAuth(url, opts.fetchFn ?? guardedFetch)));
    return {
      kind: "mcp",
      name: probe.serverName ?? probe.name,
      suggestedSlug: slugify(probe.slug),
      requiresAuthentication: probe.requiresAuthentication || requiresOAuth,
      ...(requiresOAuth ? { requiresOAuth: true } : {}),
      toolCount: probe.toolCount ?? undefined,
    };
  } catch {
    return { kind: "unknown" };
  }
}
