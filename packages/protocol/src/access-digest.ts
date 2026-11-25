import { createHash } from "node:crypto";

// WHY: Must match the gateway's store.AccessDigest: lowercase hex sha256. ADR-0017
export function accessDigest(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function accessDigestMatches(
  accessToken: string,
  digest: string,
): boolean {
  const want = accessDigest(accessToken);
  const got = digest.trim().toLowerCase();
  return want === got;
}
