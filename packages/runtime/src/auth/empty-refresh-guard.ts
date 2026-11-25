import type { Credential } from "@earendil-works/pi-ai";
import { serveModeOn } from "./serve-context";

// WHY: Mirrors pi's five-minute OAuth refresh floor; the gateway serves with the same margin. ADR-0008
export const PI_OAUTH_MIN_VALIDITY_MS = 5 * 60 * 1000;

export function isAccessOnlyOAuth(cred: Credential | undefined): boolean {
  return cred?.type === "oauth" && !cred.refresh;
}

export function needsServeSync(
  cred: Credential | undefined,
  now: number,
): boolean {
  if (cred?.type !== "oauth" || cred.refresh) return false;
  return cred.expires > 0 && now + PI_OAUTH_MIN_VALIDITY_MS >= cred.expires;
}

export function maskAccessOnly(
  cred: Credential | undefined,
): Credential | undefined {
  return isAccessOnlyOAuth(cred) ? undefined : cred;
}

let servedSync: (() => Promise<void>) | null = null;

export const BIND_GRACE_MS = 15_000;

let pendingReport: ReturnType<typeof setTimeout> | null = null;

export function bindEmptyRefreshServeSync(
  fn: (() => Promise<void>) | null,
): void {
  servedSync = fn;
  if (fn && pendingReport) {
    clearTimeout(pendingReport);
    pendingReport = null;
  }
}

// WHY: Bound callback, not import: storage.ts top-level await leaves a serve.ts cycle unorderable. ADR-0008
export async function runEmptyRefreshServeSync(): Promise<void> {
  if (servedSync) {
    await servedSync();
    return;
  }
  if (!serveModeOn() || pendingReport) return;
  pendingReport = setTimeout(() => {
    pendingReport = null;
    if (servedSync) return;
    console.error(
      "[empty-refresh-guard] serve mode is on but no served sync is bound; serve.ts never loaded after a refresh fired",
    );
  }, BIND_GRACE_MS);
  pendingReport.unref();
}
