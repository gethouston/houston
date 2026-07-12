import type { McpServerConfig } from "../integrations/mcp/provider";

interface RawMcpServer {
  id: string;
  url: string;
  name?: string;
}

function validUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP server URL must use http or https");
  }
  return url;
}

function derivedId(url: URL): string {
  // Composio's hosted endpoint gets the canonical id ("composio-apps" — NOT
  // "composio", which would collide with the platform provider in the
  // registry); anything else derives from its hostname's first label.
  if (url.hostname.toLowerCase().includes("composio")) return "composio-apps";
  const id = url.hostname.split(".")[0]?.toLowerCase();
  if (!id) throw new Error("MCP server URL has no hostname");
  return id;
}

function isRawServer(value: unknown): value is RawMcpServer {
  if (!value || typeof value !== "object") return false;
  const server = value as Record<string, unknown>;
  return (
    typeof server.id === "string" &&
    typeof server.url === "string" &&
    (server.name === undefined || typeof server.name === "string")
  );
}

export function parseMcpIntegrations(
  raw: string | undefined,
  redirectUrl: string,
): McpServerConfig[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  const entries: RawMcpServer[] = trimmed.startsWith("[")
    ? (() => {
        const parsed: unknown = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || !parsed.every(isRawServer)) {
          throw new Error("expected an array of {id,url,name?}");
        }
        return parsed;
      })()
    : [{ id: derivedId(validUrl(trimmed)), url: trimmed }];

  const ids = new Set<string>();
  return entries.map((entry) => {
    const id = entry.id.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      throw new Error(`invalid MCP server id '${entry.id}'`);
    }
    if (ids.has(id)) throw new Error(`duplicate MCP server id '${id}'`);
    ids.add(id);
    return {
      id,
      url: validUrl(entry.url).toString(),
      ...(entry.name ? { name: entry.name } : {}),
      redirectUrl,
    };
  });
}
