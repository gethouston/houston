import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";

/**
 * Qwen's persisted region choice (see ./qwen-dashscope for the provider
 * story). Model Studio international is REGION-SCOPED: a key works only
 * against the region it was created in, so the verify probe persists the
 * accepting one here — beside settings.json so it syncs with it — and every
 * model read serves it.
 */

export interface QwenRegion {
  id: string;
  baseUrl: string;
}

/**
 * The international Model Studio regions, in verify-probe order. The Singapore
 * endpoint is Alibaba's primary international region and stays the default for
 * an install that has never verified a key.
 */
export const QWEN_REGIONS: readonly QwenRegion[] = [
  {
    id: "intl",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  { id: "us", baseUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" },
];

const DEFAULT_REGION = QWEN_REGIONS[0];

/** The persisted region choice — beside settings.json so it syncs with it. */
export const qwenRegionFileIn = (dataDir: string) =>
  join(dataDir, "qwen-region.json");

/** The region the stored key verified against, defaulting to Singapore. */
export function activeQwenRegion(dataDir: string = config.dataDir): QwenRegion {
  const file = qwenRegionFileIn(dataDir);
  if (!existsSync(file)) return DEFAULT_REGION;
  try {
    const { region } = JSON.parse(readFileSync(file, "utf8")) as {
      region?: string;
    };
    return QWEN_REGIONS.find((r) => r.id === region) ?? DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

/**
 * Persist the region a key verified against into an arbitrary data dir — the
 * dataDir-bound twin a pool worker uses against a hydrated agent root (the
 * live-runtime variant in qwen-dashscope.ts re-registers the process's
 * provider too).
 */
export function setQwenRegionIn(dataDir: string, regionId: string): void {
  const region = QWEN_REGIONS.find((r) => r.id === regionId);
  if (!region) throw new Error(`unknown qwen region: ${regionId}`);
  const file = qwenRegionFileIn(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ region: region.id }, null, 2));
  renameSync(tmp, file);
}
