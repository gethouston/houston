import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { config } from "../config";

export interface QwenRegion {
  id: string;
  baseUrl: string;
}

export const QWEN_REGIONS: readonly QwenRegion[] = [
  {
    id: "intl",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  { id: "us", baseUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" },
];

const DEFAULT_REGION = QWEN_REGIONS[0];

export const qwenRegionFileIn = (dataDir: string) =>
  join(dataDir, "qwen-region.json");

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

export function setQwenRegionIn(dataDir: string, regionId: string): void {
  const region = QWEN_REGIONS.find((r) => r.id === regionId);
  if (!region) throw new Error(`unknown qwen region: ${regionId}`);
  const file = qwenRegionFileIn(dataDir);
  const tmp = atomicTempPath(file);
  writeFileSync(tmp, JSON.stringify({ region: region.id }, null, 2));
  renameSync(tmp, file);
}
