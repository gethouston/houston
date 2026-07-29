/**
 * Account-identity probes: which app action names the ACCOUNT behind a
 * connection ("dan@gmail.com"), for the apps whose OAuth payload gives us
 * nothing — Composio masks every token-ish `data` field (id_token comes back
 * as the literal string "REDACTED", verified live 2026-07-29), so the only
 * reliable identity source is asking the app itself: one read-only profile
 * call per account, executed with that account targeted and cached for the
 * process lifetime (an account's identity never changes).
 *
 * Adding an app = one registry line (its profile action + the response fields
 * that carry the identity). Toolkits with a REAL payload hint (Notion's
 * workspace_name, Jira's subdomain — values Composio does not mask) never
 * reach the probe: accountLabelOf already labelled them.
 */

/** One toolkit's identity probe: a read-only action + where the identity is. */
export interface IdentityProbe {
  /** The read-only action to execute (e.g. "GMAIL_GET_PROFILE"). */
  action: string;
  /** Arguments the action needs (most profile reads take none). */
  params?: Record<string, unknown>;
  /** Response fields that carry the identity, tried in order. */
  fields: string[];
}

/** toolkit slug (lowercase) → its probe. Verified live against Composio. */
export const IDENTITY_PROBES: Record<string, IdentityProbe> = {
  // GMAIL_GET_PROFILE → { emailAddress, messagesTotal, … }
  gmail: { action: "GMAIL_GET_PROFILE", fields: ["emailAddress"] },
  // OUTLOOK_GET_PROFILE → MS Graph /me → { mail, userPrincipalName, … }
  outlook: {
    action: "OUTLOOK_GET_PROFILE",
    fields: ["mail", "userPrincipalName"],
  },
};

/** A display label must be a short human string — same cap as accountLabelOf. */
const MAX_LABEL_LENGTH = 100;

function fieldOf(data: unknown, field: string): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const v = (data as Record<string, unknown>)[field];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_LABEL_LENGTH ? s : undefined;
}

/**
 * Pull the identity out of a probe's response data: each candidate field is
 * tried at the top level and under the common `response_data` wrapper. A shape
 * this doesn't recognize simply yields no label — never an error.
 */
export function extractIdentity(
  data: unknown,
  fields: string[],
): string | undefined {
  const wrapped =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).response_data
      : undefined;
  for (const field of fields) {
    const label = fieldOf(data, field) ?? fieldOf(wrapped, field);
    if (label) return label;
  }
  return undefined;
}
