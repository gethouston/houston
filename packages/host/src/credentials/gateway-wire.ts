import type { WorkspaceCredential } from "../ports";

/**
 * The wire shape the credential gateway serves per provider. No refresh token
 * ever crosses this wire on a GET — the gateway is the org's single refresher.
 */
export interface GatewayCredential {
  provider: string;
  kind: "oauth" | "api_key";
  access: string;
  expires: number;
  accountId?: string | null;
  enterpriseUrl?: string | null;
}

/**
 * Validate + map a gateway body to the store's credential shape. Served
 * credentials are access-only: refreshToken is always "" so no downstream
 * consumer ever tries (or leaks) a refresh the pod doesn't own.
 */
export function credentialFromGateway(
  provider: string,
  body: GatewayCredential,
): Omit<WorkspaceCredential, "workspaceId"> {
  if (
    body.provider !== provider ||
    (body.kind !== "oauth" && body.kind !== "api_key") ||
    typeof body.access !== "string" ||
    typeof body.expires !== "number"
  ) {
    throw new Error(`credential gateway returned malformed ${provider} body`);
  }
  return {
    provider: body.provider,
    kind: body.kind,
    accessToken: body.access,
    refreshToken: "",
    expiresAt: body.expires,
    ...(typeof body.accountId === "string"
      ? { accountId: body.accountId }
      : {}),
    ...(typeof body.enterpriseUrl === "string"
      ? { enterpriseUrl: body.enterpriseUrl }
      : {}),
  };
}

/**
 * True only for the gateway's own "not connected" 404 — a JSON body carrying an
 * `error` field (the /v1/pod/credentials contract). A route-level 404 (deploy
 * skew: a gateway build without the route, a mistyped HOUSTON_CREDENTIALS_URL)
 * must NOT read as "logged out": callers treat it as a transport error so the
 * runtime keeps its last hydrated token instead of wiping the org's credentials.
 */
export async function isNotConnected404(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return typeof body?.error === "string";
  } catch {
    return false;
  }
}
