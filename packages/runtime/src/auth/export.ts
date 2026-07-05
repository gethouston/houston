import { join } from "node:path";
import { config } from "../config";
import { type PiCred, readAuthFile } from "./auth-file";

export type ExportedCredential = {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
};

/**
 * Pure: choose the OAuth credential to export from an auth.json record. When
 * `provider` is given, returns EXACTLY that provider (connect-once capture is
 * provider-specific — capturing a github-copilot connect must never grab a
 * different OAuth provider that comes first in the record). Without a provider,
 * returns the first connected OAuth provider. Only OAuth credentials with both
 * access + refresh are exportable (an API key is submitted to the host directly,
 * and a scrubbed entry has refresh=""). Testable without the dataDir singleton.
 */
export function selectExportCredential(
  auth: Record<string, PiCred>,
  provider?: string,
): ExportedCredential | null {
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type === "oauth" && c.access && c.refresh) {
      return {
        provider: p,
        access: c.access,
        refresh: c.refresh,
        expires: c.expires,
        accountId: c.accountId,
        enterpriseUrl: c.enterpriseUrl,
      };
    }
  }
  return null;
}

/**
 * Export the locally-held credential so the control plane can capture it into
 * the workspace's central store right after a device-code connect. When
 * `provider` is given, exports EXACTLY that provider — connect-once capture is
 * provider-specific, so capturing a github-copilot connect must never grab a
 * different OAuth provider that happens to come first in auth.json (which would
 * leave Copilot un-persisted centrally and 404 every per-turn serve). Without a
 * provider, falls back to the first connected OAuth provider. Returns null when
 * the (requested) provider isn't connected — also the post-scrub state, so
 * capture must run before scrub.
 */
export function exportCredential(provider?: string): ExportedCredential | null {
  return selectExportCredential(
    readAuthFile(join(config.dataDir, "auth.json")),
    provider,
  );
}
