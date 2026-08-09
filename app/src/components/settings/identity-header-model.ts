/**
 * The identity header's resolved fields, derived from the ONE self-identity
 * (`useMyProfile`) plus the session's email. A DOM-free module so the one rule
 * that is not a straight pass-through — when the email line is worth drawing —
 * is unit-tested under `node --test` without React.
 */
export interface IdentityHeaderFace {
  /** Never blank: `resolveMyProfile` already falls back name > email > id. */
  name: string;
  /** The second line, or `null` when there is nothing honest to put there. */
  email: string | null;
  /** The photo, or `null` so the header renders initials instead. */
  avatarUrl: string | null;
}

/**
 * Resolve what the header draws.
 *
 * The email line is DROPPED when it is blank or when it is already the name:
 * `resolveMyProfile` falls back to the email for anyone who never set a display
 * name, and printing the same address twice, once bold and once muted, reads
 * like a rendering bug rather than a fact about the account.
 */
export function identityHeaderFace(input: {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}): IdentityHeaderFace {
  const name = input.name.trim();
  const email = (input.email ?? "").trim();
  return {
    name,
    email: email && email !== name ? email : null,
    avatarUrl: input.avatarUrl ?? null,
  };
}
