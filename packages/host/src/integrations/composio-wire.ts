import type { ActionResult, Connection, Toolkit, ToolMatch } from "./types";

export interface RawAuthConfig {
  id?: string;
  status?: string;
}
type RawCategory = string | { id?: string; name?: string };

export interface RawToolkit {
  slug?: string;
  name?: string;
  meta?: { description?: string; logo?: string; categories?: RawCategory[] };
  description?: string;
  logo_url?: string;
  categories?: RawCategory[];
  no_auth?: boolean;
}
export interface RawConnection {
  toolkit?: { slug?: string } | string;
  slug?: string;
  connected_account_id?: string;
  id?: string;
  status?: string;
  user_id?: string;
  created_at?: string;
  data?: Record<string, unknown>;
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
    ...(t.no_auth ? { noAuth: true } : {}),
    categories: (t.meta?.categories ?? t.categories ?? [])
      .map((c) => (typeof c === "string" ? c : (c.id ?? c.name ?? "")))
      .filter(Boolean),
  };
}

export function mapConnection(c: RawConnection): Connection {
  const toolkit =
    typeof c.toolkit === "string"
      ? c.toolkit
      : (c.toolkit?.slug ?? c.slug ?? "");
  const accountLabel = accountLabelOf(c.data);
  return {
    toolkit,
    connectionId: c.connected_account_id ?? c.id ?? "",
    status: mapStatus(c.status),
    ...(accountLabel ? { accountLabel } : {}),
    ...(typeof c.created_at === "string" ? { createdAt: c.created_at } : {}),
  };
}

const MAX_LABEL_LENGTH = 100;

function asLabel(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_LABEL_LENGTH ? s : undefined;
}

export function accountLabelOf(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const claims = decodeJwtClaims(data.id_token);
  return (
    asLabel(claims?.email) ??
    asLabel(claims?.name) ??
    asLabel(data.email) ??
    asLabel(data.workspace_name) ??
    asLabel(data.subdomain)
  );
}

function decodeJwtClaims(
  token: unknown,
): { email?: unknown; name?: unknown } | undefined {
  if (typeof token !== "string") return undefined;
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object"
      ? (claims as { email?: unknown; name?: unknown })
      : undefined;
  } catch {
    return undefined;
  }
}

function mapStatus(status?: string): Connection["status"] {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "INITIALIZING":
    case "INITIATED":
      return "pending";
    default:
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
