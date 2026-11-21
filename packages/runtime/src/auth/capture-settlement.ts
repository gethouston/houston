import {
  hasRefreshToken,
  readAuthFile,
  type ServedCredential,
  scrubRefreshTokenAt,
} from "./auth-file";

export function scrubSettledCaptureAt(
  path: string,
  served: ServedCredential,
): boolean {
  if (served.kind === "api_key") return false;
  const cred = readAuthFile(path)[served.provider];
  if (cred?.type !== "oauth" || !hasRefreshToken(cred)) return false;
  if (cred.access !== served.access) return false;
  return scrubRefreshTokenAt(path, served.provider);
}
