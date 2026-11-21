import { createHash } from "node:crypto";
import type { CredentialActing } from "../ports";

export const TEAM_SCOPE_KEY = "team";

export function credentialScopeKey(
  acting: CredentialActing | undefined,
): string {
  const token = acting?.actingAs;
  if (!token) return TEAM_SCOPE_KEY;
  const payload = token.split(".")[1];
  if (!payload) return unreadableScopeKey(token);
  try {
    const decoded = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as { sub?: unknown };
    return typeof decoded.sub === "string"
      ? `u:${decoded.sub}`
      : unreadableScopeKey(token);
  } catch {
    return unreadableScopeKey(token);
  }
}

export function isPersonalScopeKey(key: string): boolean {
  return key !== TEAM_SCOPE_KEY;
}

function unreadableScopeKey(token: string): string {
  return `u:unreadable-${createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 16)}`;
}
