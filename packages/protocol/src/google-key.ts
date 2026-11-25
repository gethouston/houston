// WHY: Denylist, not allowlist: Google ships new key prefixes like AQ.; unknown shapes fail open. ADR-0017
export function deadGoogleApiKey(cred: {
  provider: string;
  kind?: "oauth" | "api_key";
  access: string;
}): boolean {
  return (
    cred.provider === "google" &&
    cred.kind === "api_key" &&
    (cred.access.startsWith("ya29.") || cred.access.startsWith("eyJ"))
  );
}
