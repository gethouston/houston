import type { AgentConfig, AgentInitialConfig } from "@houston/protocol";
import { CONFIG_SEED_KEY } from "./first-day-config";
import { toCanonicalProviderId } from "./provider-dialect";
import { jsonDoc } from "./store";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parsedObject(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function withInitialConfigSeed(
  seeds: Record<string, string> | undefined,
  config: AgentInitialConfig | undefined,
): Record<string, string> | undefined {
  if (!config) return seeds;
  const fields: AgentConfig = {
    ...(config.provider
      ? { provider: toCanonicalProviderId(config.provider) }
      : {}),
    ...(config.model ? { model: config.model } : {}),
    ...(config.firstDay ? { firstDay: config.firstDay } : {}),
    ...(config.arrival ? { arrival: config.arrival } : {}),
  };
  if (Object.keys(fields).length === 0) return seeds;
  const merged = { ...parsedObject(seeds?.[CONFIG_SEED_KEY]), ...fields };
  return { ...seeds, [CONFIG_SEED_KEY]: jsonDoc(merged) };
}
