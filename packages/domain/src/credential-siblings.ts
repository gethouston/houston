/**
 * Providers that share ONE upstream credential.
 *
 * OpenCode Zen (`opencode`) and OpenCode Go (`opencode-go`) are two distinct pi
 * gateways — `opencode.ai/zen/v1` vs `opencode.ai/zen/go/v1`, with disjoint
 * model catalogs — but they authenticate with the SAME opencode.ai key: pi reads
 * `OPENCODE_API_KEY` for both. So a credential connected for either gateway
 * connects both; there is NO separate "OpenCode Go" sign-in. The frontend
 * already models this as one account with `gatewayIds: ["opencode","opencode-go"]`
 * (app/src/lib/providers.ts) — this is the backend half of that contract.
 *
 * The runtime keeps a byte-identical copy at
 * `packages/runtime/src/auth/credential-siblings.ts` (it can't import
 * `@houston/domain`, the same reason it mirrors `ProviderId`). Keep them in sync.
 */
const CREDENTIAL_SIBLING_GROUPS: readonly (readonly string[])[] = [
  ["opencode", "opencode-go"],
];

/** The other provider ids that share `id`'s stored credential (excludes `id`). */
export function credentialSiblings(id: string): string[] {
  const group = CREDENTIAL_SIBLING_GROUPS.find((g) => g.includes(id));
  return group ? group.filter((p) => p !== id) : [];
}
