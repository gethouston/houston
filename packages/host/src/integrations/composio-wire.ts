import type { ActionResult, Connection, Toolkit, ToolMatch } from "./types";

/**
 * Composio wire shapes + their mapping onto the port types — the ONLY place
 * Composio's response format is known. The adapter (composio.ts) shapes the
 * requests; this module reads the replies.
 */

export interface RawAuthConfig {
  id?: string;
  status?: string;
}
export interface RawToolkit {
  slug?: string;
  name?: string;
  meta?: { description?: string; logo?: string };
  description?: string;
  logo_url?: string;
  categories?: (string | { name?: string })[];
}
export interface RawConnection {
  toolkit?: { slug?: string } | string;
  slug?: string;
  connected_account_id?: string;
  id?: string;
  status?: string;
  /** The Composio user this account belongs to — the ownership guard's input. */
  user_id?: string;
}
export interface RawTool {
  slug?: string;
  name?: string;
  toolkit?: { slug?: string } | string;
  description?: string;
  input_parameters?: unknown;
}
export interface RawExecute {
  successful?: boolean;
  success?: boolean;
  data?: unknown;
  error?: string | null;
}

export function mapToolkit(t: RawToolkit): Toolkit {
  return {
    slug: t.slug ?? "",
    name: t.name ?? t.slug ?? "",
    description: t.meta?.description ?? t.description,
    logoUrl: t.meta?.logo ?? t.logo_url,
    categories: (t.categories ?? [])
      .map((c) => (typeof c === "string" ? c : (c.name ?? "")))
      .filter(Boolean),
  };
}

export function mapConnection(c: RawConnection): Connection {
  const toolkit =
    typeof c.toolkit === "string"
      ? c.toolkit
      : (c.toolkit?.slug ?? c.slug ?? "");
  return {
    toolkit,
    connectionId: c.connected_account_id ?? c.id ?? "",
    status: mapStatus(c.status),
  };
}

/** Composio's connected-account statuses → the port's three. */
function mapStatus(status?: string): Connection["status"] {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "INITIALIZING":
    case "INITIATED":
      return "pending";
    default:
      // FAILED / EXPIRED / INACTIVE / REVOKED / unknown — needs reconnecting.
      return "error";
  }
}

export function mapTool(t: RawTool): ToolMatch {
  const toolkit =
    typeof t.toolkit === "string" ? t.toolkit : (t.toolkit?.slug ?? "");
  return {
    action: t.slug ?? "",
    toolkit,
    description: t.description ?? "",
    inputParams: t.input_parameters,
  };
}

export function mapExecute(r: RawExecute | null): ActionResult {
  if (!r) return { successful: false, error: "empty response" };
  const successful = r.successful ?? r.success ?? !r.error;
  return { successful, data: r.data, error: r.error ?? undefined };
}
