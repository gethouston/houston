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
 * Flow: `listAgents` hydrates once per active space — account entries fill
 * ids the device is missing (the post-sign-out restore), the device copy wins
 * per id (it holds the freshest pick), and a device map the account lacks is
 * healed UP so pre-fix colors become durable. Every later overlay write
 * (pick/rename/delete) re-pushes the full map.
 */
export const AGENT_COLORS_PREF_KEY = "agent_colors";

let syncCfg: ControlPlaneConfig | null = null;
/** Spaces already hydrated this session — preferences are scoped to the
 *  ACTIVE space (the gateway keys them by org), so each space visited gets
 *  one read + heal, which is also what carries colors into a team space
 *  after a move-to-organization. */
let hydratedSpaces = new Set<string>();
let pushChain: Promise<void> = Promise.resolve();
let pushQueued = false;

/** Account entries fill the gaps; the device's own picks win per id. */
export function mergeColorOverlays(
  account: Record<string, string>,
  device: Record<string, string>,
): Record<string, string> {
  return { ...account, ...device };
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
 * Merge the account copy into the device overlay before the agent list is
 * mapped. Never throws — an unreachable host must not take the agent list
 * down with it; the space is simply not marked hydrated, so the next list
 * retries. Runs once per (config, active space).
 */
export async function hydrateAgentColors(
  cfg: ControlPlaneConfig,
): Promise<void> {
  if (syncCfg !== cfg) {
    syncCfg = cfg;
    hydratedSpaces = new Set();
    setOverlayWriteListener(schedulePush);
  }
  const space = cfg.activeOrgSlug ?? "";
  if (hydratedSpaces.has(space)) return;
  let account: Record<string, string>;
  try {
    account = parseAccountColors(
      await getPreference(cfg, AGENT_COLORS_PREF_KEY),
    );
  } catch (e) {
    // Read-side degrade (the onboarding-completed precedent): the device
    // overlay still renders, and hydration retries on the next agent list.
    console.error("[agent-colors] account read failed; device copy shown", e);
    return;
  }
  hydratedSpaces.add(space);
  const device = colorOverlay();
  const merged = mergeColorOverlays(account, device);
  if (!sameRecord(merged, device)) overwriteColorOverlay(merged);
  if (!sameRecord(merged, account)) schedulePush();
}

/** Serialize pushes so an earlier map can never land after a later one; a
 *  write during an in-flight PUT queues exactly one follow-up that re-reads
 *  the freshest overlay. */
function schedulePush(): void {
  const cfg = syncCfg;
  if (!cfg || pushQueued) return;
  pushQueued = true;
  pushChain = pushChain.then(async () => {
    pushQueued = false;
    try {
      await setPreference(
        cfg,
        AGENT_COLORS_PREF_KEY,
        JSON.stringify(colorOverlay()),
      );
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
 * Forget which spaces were hydrated. Called from `setEndpoint`, which repoints
 * the ONE long-lived client in place: after it the bearer may belong to a
 * DIFFERENT account (sign-out purged the overlay, then someone else signed
 * in), so the next agent list must re-merge THAT account's colors instead of
 * trusting this session's earlier read. A same-account token rotation just
 * re-runs one cheap, idempotent GET per space.
 */
export function resetAgentColorSync(): void {
  hydratedSpaces = new Set();
}
