import type { AgentInitialConfig } from "@houston/engine-adapter";
import type { QueryClient } from "@tanstack/react-query";
import type { Config } from "../../data/config.ts";
import { toCanonicalProviderId } from "../provider-overrides/dialect.ts";
import { queryKeys } from "../query-keys.ts";

export function bornConfig(initial: AgentInitialConfig): Config {
  return {
    ...(initial.provider
      ? { provider: toCanonicalProviderId(initial.provider) }
      : {}),
    ...(initial.model ? { model: initial.model } : {}),
    ...(initial.firstDay ? { firstDay: initial.firstDay } : {}),
    ...(initial.arrival ? { arrival: initial.arrival } : {}),
  };
}

export function seedBornConfig(
  client: QueryClient,
  agentPath: string,
  initial: AgentInitialConfig | undefined,
): void {
  if (!initial) return;
  const born = bornConfig(initial);
  if (Object.keys(born).length === 0) return;
  client.setQueryData<Config>(
    queryKeys.config(agentPath),
    (prev) => ({ ...prev, ...born }),
    { updatedAt: 0 },
  );
}

export function recordFirstDayStarted(
  client: QueryClient,
  agentPath: string,
): void {
  client.setQueryData<Config>(queryKeys.config(agentPath), (prev) => ({
    ...prev,
    firstDay: "started",
  }));
}

export function readAgentConfig(deps: {
  creating: boolean;
  cached: Config | undefined;
  read: () => Promise<Config>;
}): Promise<Config> {
  return deps.creating ? Promise.resolve(deps.cached ?? {}) : deps.read();
}
