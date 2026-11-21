import { hasSessionRefresher, refreshLiveToken } from "../session-refresh";
import { describeBearer, formatBearerDescription } from "./bearer-claims";

export const inControlPlaneMode = (): boolean =>
  typeof window !== "undefined" &&
  (window as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ === true;

export const MIN_BEARER_REMAINING_S = 60;

export function isBearerExpiredByClaims(
  bearer: string,
  nowMs: number = Date.now(),
): boolean {
  const expiresInS = describeBearer(bearer, nowMs)?.expiresInS;
  return expiresInS != null && expiresInS <= MIN_BEARER_REMAINING_S;
}

const nextMacrotask = () => new Promise<void>((r) => setTimeout(r, 0));

async function refreshBearer(): Promise<string | null> {
  const fresh = await refreshLiveToken();
  if (fresh || !inControlPlaneMode() || hasSessionRefresher()) return fresh;
  await nextMacrotask();
  if (hasSessionRefresher()) return refreshLiveToken();
  console.warn(
    "[gateway-auth] 401 with no session refresher installed on a hosted page; surfacing the gateway's answer as-is",
  );
  return null;
}

export async function refreshUsableBearer(): Promise<string | null> {
  const fresh = await refreshBearer();
  if (!fresh || !isBearerExpiredByClaims(fresh)) return fresh;
  if (noteDiscarded(fresh)) {
    console.warn(
      "[gateway-bearer] the refresher handed back a bearer already expired by its claims; " +
        `discarded ${formatBearerDescription(describeBearer(fresh))}, asking once more`,
    );
  }
  return refreshLiveToken();
}

const DISCARDED_LIMIT = 8;
const discarded: string[] = [];

function noteDiscarded(bearer: string): boolean {
  if (discarded.includes(bearer)) return false;
  discarded.push(bearer);
  if (discarded.length > DISCARDED_LIMIT) discarded.shift();
  return true;
}

export function resetDiscardedBearers(): void {
  discarded.length = 0;
}
