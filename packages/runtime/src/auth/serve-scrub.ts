import {
  readServedProvidersAt,
  scrubRefreshTokenAt,
  writeServedProvidersAt,
} from "./auth-file";
import { authPathFor, servedManifestPathFor } from "./serve-context";
import { authStorage } from "./storage";

// WHY: Record serve ownership at capture, before first serve, or logout cannot remove the local copy. ADR-0008
export function scrubRefreshTokens(provider: string): string[] {
  const scrubbed = scrubRefreshTokenAt(authPathFor(), provider);
  const manifestPath = servedManifestPathFor();
  const manifest = new Set(readServedProvidersAt(manifestPath));
  if (!manifest.has(provider)) {
    manifest.add(provider);
    writeServedProvidersAt(manifestPath, [...manifest]);
  }
  if (scrubbed) authStorage.reload();
  return scrubbed ? [provider] : [];
}
