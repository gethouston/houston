import { currentCredentialScope } from "../session/acting-context";
import { bindEmptyRefreshServeSync } from "./empty-refresh-guard";
import { runServedSync } from "./serve-sync-run";

export {
  anthropicServedHere,
  resetAnthropicServedHereForTest,
  serveModeOn,
} from "./serve-context";
export { scrubRefreshTokens } from "./serve-scrub";

const serveSyncInFlight = new Map<string, Promise<string[]>>();

export function syncServedCredential(): Promise<string[]> {
  const { key } = currentCredentialScope();
  const inFlight = serveSyncInFlight.get(key);
  if (inFlight) return inFlight;
  const run = runServedSync().finally(() => {
    serveSyncInFlight.delete(key);
  });
  serveSyncInFlight.set(key, run);
  return run;
}

export async function syncServedCredentialSafe(tag: string): Promise<void> {
  try {
    await syncServedCredential();
  } catch (err) {
    console.error(
      `[${tag}] credential sync failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

bindEmptyRefreshServeSync(() =>
  syncServedCredentialSafe("empty-refresh-guard"),
);
