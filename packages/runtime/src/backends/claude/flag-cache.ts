import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";

export interface ClaudeFlagCache {
  cachedGrowthBookFeatures: Record<string, unknown>;
  cachedGrowthBookFeaturesAt?: number;
  cachedExperimentFeatures?: string[];
  cachedExperimentData?: Record<string, unknown>;
}

export const CLAUDE_GLOBAL_CONFIG = ".claude.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseClaudeFlagCache(
  value: unknown,
): ClaudeFlagCache | undefined {
  if (!isRecord(value)) return undefined;
  const features = value.cachedGrowthBookFeatures;
  if (!isRecord(features) || Object.keys(features).length === 0)
    return undefined;
  const at = value.cachedGrowthBookFeaturesAt;
  const experiments = value.cachedExperimentFeatures;
  const experimentData = value.cachedExperimentData;
  if (at !== undefined && (typeof at !== "number" || !Number.isFinite(at)))
    return undefined;
  if (
    experiments !== undefined &&
    (!Array.isArray(experiments) ||
      !experiments.every((key) => typeof key === "string"))
  )
    return undefined;
  if (experimentData !== undefined && !isRecord(experimentData))
    return undefined;
  return {
    cachedGrowthBookFeatures: features,
    ...(at !== undefined ? { cachedGrowthBookFeaturesAt: at } : {}),
    ...(experiments !== undefined
      ? { cachedExperimentFeatures: experiments as string[] }
      : {}),
    ...(experimentData !== undefined
      ? { cachedExperimentData: experimentData }
      : {}),
  };
}

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function readJson(
  path: string,
  onCorrupt: (reason: string) => void,
): unknown | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      onCorrupt(reason(error));
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    onCorrupt(reason(error));
    return undefined;
  }
}

export function readClaudeFlagCacheFile(
  path: string,
  onCorrupt: (reason: string) => void,
): ClaudeFlagCache | undefined {
  const value = readJson(path, onCorrupt);
  if (value === undefined) return undefined;
  const cache = parseClaudeFlagCache(value);
  if (!cache) onCorrupt("not a feature-flag cache");
  return cache;
}

export function readClaudeConfigFlags(
  configDir: string,
  onCorrupt: (reason: string) => void,
): ClaudeFlagCache | undefined {
  return parseClaudeFlagCache(
    readJson(join(configDir, CLAUDE_GLOBAL_CONFIG), onCorrupt),
  );
}

export function writeClaudeFlagCacheFile(
  path: string,
  cache: ClaudeFlagCache,
): void {
  const tmp = atomicTempPath(path);
  writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
  renameSync(tmp, path);
}

export function seedClaudeConfigFlags(
  configDir: string,
  cache: ClaudeFlagCache,
): boolean {
  const path = join(configDir, CLAUDE_GLOBAL_CONFIG);
  if (existsSync(path)) return false;
  mkdirSync(configDir, { recursive: true });
  writeClaudeFlagCacheFile(path, cache);
  return true;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function sameClaudeFlags(a: ClaudeFlagCache, b: ClaudeFlagCache) {
  return (
    canonical([
      a.cachedGrowthBookFeatures,
      a.cachedExperimentFeatures,
      a.cachedExperimentData,
    ]) ===
    canonical([
      b.cachedGrowthBookFeatures,
      b.cachedExperimentFeatures,
      b.cachedExperimentData,
    ])
  );
}
