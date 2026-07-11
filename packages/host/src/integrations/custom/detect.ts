import type { CustomExecutor } from "./executor-host";
import { slugify } from "./slug";

/** What a pasted URL turned out to be — the agent's interview pivot. */
export interface DetectResult {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  /** MCP probe: does the server demand auth before listing tools? */
  requiresAuthentication?: boolean;
  toolCount?: number;
}

/**
 * Classify a user-provided URL: an OpenAPI document (the executor's detect
 * parses it), else probe it as a remote MCP endpoint, else unknown. Detection
 * failures are a RESULT (`unknown`), never a throw — the agent relays "not a
 * recognizable service URL" and asks for a better link.
 */
export async function detectSource(
  executor: CustomExecutor,
  url: string,
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
    return {
      kind: "mcp",
      name: probe.serverName ?? probe.name,
      suggestedSlug: slugify(probe.slug),
      requiresAuthentication:
        probe.requiresAuthentication || probe.requiresOAuth,
      toolCount: probe.toolCount ?? undefined,
    };
  } catch {
    return { kind: "unknown" };
  }
}
