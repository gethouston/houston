import type { AgentConfig, AgentInitialConfig } from "@houston/protocol";
import { CONFIG_SEED_KEY } from "./first-day-config";
import { toCanonicalProviderId } from "./provider-dialect";
import { jsonDoc } from "./store";

/**
 * How a new agent is born with its config: the create's seed map carries it
 * as the config document (`first-day-config.ts` holds the rules that keep it).
 */

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

/**
 * The create-time seed map with the agent's initial config folded into its
 * config document, so the config lands in the SAME request that creates the
 * agent: the host writes seeds before it answers, and the hosted gateway
 * seeds the new pod with them before the pod serves anything. A template that
 * seeds its own config keeps every field the initial config does not name.
 */
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
