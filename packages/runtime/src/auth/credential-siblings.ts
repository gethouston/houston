/**
 * Providers that share ONE upstream credential.
 *
 * OpenCode Zen (`opencode`) and OpenCode Go (`opencode-go`) are two distinct pi
 * gateways — `opencode.ai/zen/v1` vs `opencode.ai/zen/go/v1`, with disjoint
 * model catalogs — but they authenticate with the SAME opencode.ai key: pi reads
 * `OPENCODE_API_KEY` for both. So a credential connected for either gateway
 * connects both; there is NO separate "OpenCode Go" sign-in.
 *
 * This is a byte-identical mirror of `@houston/domain`'s `credentialSiblings`
 * (the runtime can't import `@houston/domain`, the same reason `@houston/domain`
 * mirrors this package's `ProviderId`). Keep the two in sync.
 */
const CREDENTIAL_SIBLING_GROUPS: readonly (readonly string[])[] = [
  ["opencode", "opencode-go"],
];

/** The other provider ids that share `id`'s stored credential (excludes `id`). */
export function credentialSiblings(id: string): string[] {
  const group = CREDENTIAL_SIBLING_GROUPS.find((g) => g.includes(id));
  return group ? group.filter((p) => p !== id) : [];
}
