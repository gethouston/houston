import { createHash } from "node:crypto";

/**
 * SUBPATH EXPORT ONLY — deliberately absent from this package's barrel
 * (`@houston/protocol`). The barrel is browser-facing: `app` and `packages/web`
 * typecheck and bundle it, and `node:crypto` is not resolvable there. Only
 * Node/Bun consumers (the runtime and the host) import
 * `@houston/protocol/access-digest`.
 *
 * The wire identity of an access token: lowercase hex sha256.
 *
 * A runtime that hits `401 token revoked` needs to tell the credential store
 * WHICH token the provider rejected, so the store can drop that one and only
 * that one (HOU-952). Naming it by digest keeps the token itself out of a
 * report that crosses a process — and out of logs, which is where reports of
 * this kind end up.
 *
 * Must stay byte-compatible with the gateway's `store.AccessDigest`
 * (cloud/internal/store/store.go): the pod computes the digest and the gateway
 * compares it against what IT holds, so both sides must agree on the hash and
 * the casing.
 */
export function accessDigest(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

/**
 * Whether a stored access token is the one a digest names. Case-insensitive on
 * the hex so an upper-cased digest is not silently read as "some other token"
 * — that would turn a real revocation report into a no-op.
 */
export function accessDigestMatches(
  accessToken: string,
  digest: string,
): boolean {
  const want = accessDigest(accessToken);
  const got = digest.trim().toLowerCase();
  // Lengths are fixed and equal here, so a plain compare leaks nothing useful;
  // the digest is not a secret in the first place (the token it names is).
  return want === got;
}
