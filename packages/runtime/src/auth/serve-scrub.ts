import {
  readServedProvidersAt,
  scrubRefreshTokenAt,
  writeServedProvidersAt,
} from "./auth-file";
import { authPathFor, servedManifestPathFor } from "./serve-context";
import { authStorage } from "./storage";

/**
 * Config-bound scrub used by POST /auth/scrub-refresh. Provider-scoped
 * (PRODUCT-1320): the host calls this for exactly the provider whose capture
 * just landed centrally, so a concurrent second provider's freshly-written
 * refresh token (mid-capture, not yet exported) survives untouched.
 *
 * This is also the moment the provider becomes serve-owned, so it is recorded
 * in the served-providers manifest HERE — at capture time, not at first serve.
 * The host only ever calls this route right after a successful central PUT, so
 * manifest membership is honest, and a later authoritative central 404 can
 * remove the local copy (the CRED-09 gap: capture-then-sign-out before any
 * serve ran left an unowned entry behind). This cannot confuse the mid-capture
 * guard: that guard keys on the ENTRY's refresh token (hasRefreshToken), never
 * on the manifest, and removeServedCredentialAt independently refuses
 * refresh-bearing entries.
 */
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
