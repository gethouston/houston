import {
  colorOverlay,
  overwriteColorOverlay,
  setOverlayWriteListener,
} from "./agent-color";
import type { ControlPlaneConfig } from "./fetch";
import { getPreference, setPreference } from "./preferences";

export const AGENT_COLORS_PREF_KEY = "agent_colors";

let syncCfg: ControlPlaneConfig | null = null;
let pushChain: Promise<void> = Promise.resolve();
let pushQueued = false;
let devicePending = false;
let deviceWrites = 0;

export function mergeColorOverlays(
  account: Record<string, string>,
  device: Record<string, string>,
  deviceWins: boolean,
): Record<string, string> {
  return deviceWins ? { ...account, ...device } : { ...device, ...account };
}

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
    console.error("[agent-colors] account read failed; device copy shown", e);
    return;
  }
  const device = colorOverlay();
  const deviceWins = devicePending || deviceWrites !== writesBefore;
  const merged = mergeColorOverlays(account, device, deviceWins);
  if (!sameRecord(merged, device)) overwriteColorOverlay(merged);
  if (!sameRecord(merged, account)) schedulePush();
}

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
      if (!pushQueued && sameRecord(pushed, colorOverlay()))
        devicePending = false;
    } catch (e) {
      console.error("[agent-colors] account save failed; kept on-device", e);
    }
  });
}

export function flushAgentColorPushes(): Promise<void> {
  return pushChain;
}

export function resetAgentColorSync(): void {
  devicePending = false;
}
