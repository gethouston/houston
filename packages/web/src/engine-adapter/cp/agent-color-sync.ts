import {
  colorOverlay,
  overwriteColorOverlay,
  setOverlayWriteListener,
} from "./agent-color";
import type { ControlPlaneConfig } from "./fetch";
import { getPreference, setPreference } from "./files-context";

/**
 * Durable home for agent colors: the `agent_colors` ACCOUNT preference
 * (PRODUCT-1344). The localStorage overlay (`./agent-color`) is only the
 * DEVICE copy, and sign-out purges every account-scoped `houston.*` key
 * (PRODUCT-1235) — so a device-only color died with the session and every
 * agent came back default-purple, with nothing server-side to restore from.
 * Same shape as the overlay (agent id → color), stored as one JSON blob
 * behind `/v1/preferences/:key`, which the local host, self-host, and the
 * cloud gateway all serve (the PRODUCT-1282 `onboarding_completed` pattern).
 *
 * Flow: every `listAgents` reconciles the two copies. Entries only the device
 * holds always survive, so a pre-fix device map is healed UP and becomes
 * durable. Which copy wins a SHARED id depends on whether this device still
 * owes the account a write: while a pick is unsaved the device wins (its pick
 * must not be overwritten by the copy it is about to replace), and once the
 * account has accepted it the account wins — that is what carries a color set
 * on another device, or by the assistant's `updateAgentColor`, onto this one.
 */
export const AGENT_COLORS_PREF_KEY = "agent_colors";

let syncCfg: ControlPlaneConfig | null = null;
let pushChain: Promise<void> = Promise.resolve();
let pushQueued = false;
/** Set by every overlay write, cleared only once the account copy has ACCEPTED
 *  that exact map. A failed save therefore keeps the device winning instead of
 *  letting the next reconcile silently restore the color the user replaced. */
let devicePending = false;
/** Counts overlay writes so a reconcile can tell whether one landed WHILE its
 *  read was in flight: such a read predates the pick and is stale even if the
 *  push that followed it has already succeeded. */
let deviceWrites = 0;

/**
 * Entries only one side holds always survive. `devicePending` decides the
 * shared ids: the device's unsaved pick, or the account's accepted truth.
 */
export function mergeColorOverlays(
  account: Record<string, string>,
  device: Record<string, string>,
  deviceWins: boolean,
): Record<string, string> {
  return deviceWins ? { ...account, ...device } : { ...device, ...account };
}

/** Parse the stored pref defensively: absent/corrupt → empty, and only
 *  string→string entries survive (the value is palette id or hex). */
export function parseAccountColors(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return {};
    const out: Record<string, string> = {};
    for (const [id, color] of Object.entries(parsed)) {
      if (typeof color === "string" && color.length > 0 && color.length <= 64)
        out[id] = color;
    }
    return out;
  } catch {
    return {};
  }
}

function sameRecord(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => a[key] === b[key])
  );
}

/**
 * Reconcile the account copy with the device overlay before the agent list is
 * mapped. Runs on EVERY list: one small preference read alongside the list
 * fetch is what makes a color set anywhere else appear here, since the agent
 * list is already refetched whenever an agent changes. Never throws — an
 * unreachable host must not take the agent list down with it; the device
 * overlay still renders and the next list retries.
 */
export async function syncAgentColors(cfg: ControlPlaneConfig): Promise<void> {
  if (syncCfg !== cfg) {
    syncCfg = cfg;
    devicePending = false;
    setOverlayWriteListener(schedulePush);
  }
  const writesBefore = deviceWrites;
  let account: Record<string, string>;
  try {
    account = parseAccountColors(
      await getPreference(cfg, AGENT_COLORS_PREF_KEY),
    );
  } catch (e) {
    // Read-side degrade (the onboarding-completed precedent): the device
    // overlay still renders, and the next agent list retries.
    console.error("[agent-colors] account read failed; device copy shown", e);
    return;
  }
  const device = colorOverlay();
  // A pick made WHILE this read was in flight predates the answer, so the
  // answer is stale even if its own push has already been accepted.
  const deviceWins = devicePending || deviceWrites !== writesBefore;
  const merged = mergeColorOverlays(account, device, deviceWins);
  if (!sameRecord(merged, device)) overwriteColorOverlay(merged);
  if (!sameRecord(merged, account)) schedulePush();
}

/** Serialize pushes so an earlier map can never land after a later one; a
 *  write during an in-flight PUT queues exactly one follow-up that re-reads
 *  the freshest overlay. */
function schedulePush(): void {
  const cfg = syncCfg;
  if (!cfg) return;
  devicePending = true;
  deviceWrites += 1;
  if (pushQueued) return;
  pushQueued = true;
  pushChain = pushChain.then(async () => {
    pushQueued = false;
    const pushed = colorOverlay();
    try {
      await setPreference(cfg, AGENT_COLORS_PREF_KEY, JSON.stringify(pushed));
      // Clean only if this push carried the CURRENT map: a write that landed
      // mid-flight leaves the account a version behind, and its own queued
      // push is what clears the debt.
      if (!pushQueued && sameRecord(pushed, colorOverlay()))
        devicePending = false;
    } catch (e) {
      // The device write already succeeded (the user sees their pick); the
      // account copy self-heals on the next write or hydration, so this
      // degrade is logged, not toasted — the PRODUCT-1282 account-pref
      // precedent.
      console.error("[agent-colors] account save failed; kept on-device", e);
    }
  });
}

/** Await every scheduled push (tests, and any caller that must not race). */
export function flushAgentColorPushes(): Promise<void> {
  return pushChain;
}

/**
 * Drop this device's claim to be ahead of the account. Called from
 * `setEndpoint`, which repoints the ONE long-lived client in place: after it
 * the bearer may belong to a DIFFERENT account (sign-out purged the overlay,
 * then someone else signed in), and an unsaved pick from the previous session
 * must not outrank the incoming account's own colors.
 */
export function resetAgentColorSync(): void {
  devicePending = false;
}
