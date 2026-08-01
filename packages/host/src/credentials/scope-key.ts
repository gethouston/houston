import { createHash } from "node:crypto";
import type { CredentialActing } from "../ports";

/**
 * WHOSE credentials a store call addresses, as one opaque key (HOU-976).
 *
 * The gateway resolves personal-vs-team per (org, user, provider) and mints the
 * acting-as token that names the member; every credential adapter has to agree
 * on how that token becomes a storage key, or the same member reads a different
 * row in two adapters. So the derivation lives here, once, and is shared by the
 * managed-pod adapter (remote-store.ts) and the local ones (store.ts,
 * file-store.ts).
 *
 * Mirrors the runtime's own rule (`packages/runtime/src/session/acting-context.ts`
 * `credentialScopeKeyFor`) deliberately: the same identity must resolve to the
 * same scope on both sides of the host↔runtime seam.
 */

/** The scope key of a call with no acting identity: the one shared row. */
export const TEAM_SCOPE_KEY = "team";

/**
 * The scope key for an acting identity. `"team"` with no token — desktop,
 * self-host, routines, and every pre-HOU-976 call — so those paths keep
 * addressing the single shared credential exactly as before.
 *
 * A token whose payload we cannot read is NOT the team: falling back to the
 * shared key would let a garbled token READ the team credential. It gets its own
 * isolated key, named by a DIGEST of the token — this key reaches log lines, so
 * the token itself must never be it.
 */
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

/** Whether a scope key addresses one member's own row rather than the team's. */
export function isPersonalScopeKey(key: string): boolean {
  return key !== TEAM_SCOPE_KEY;
}

function unreadableScopeKey(token: string): string {
  return `u:unreadable-${createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 16)}`;
}
