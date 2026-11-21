import type { WorkspaceCredential } from "../ports";

export interface GatewayCredential {
  provider: string;
  kind: "oauth" | "api_key";
  access: string;
  expires: number;
  accountId?: string | null;
  enterpriseUrl?: string | null;
  scope?: "personal" | "team";
}

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
    scope: body.scope === "personal" ? "personal" : "team",
  };
}

export async function isNotConnected404(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return typeof body?.error === "string";
  } catch {
    return false;
  }
}
