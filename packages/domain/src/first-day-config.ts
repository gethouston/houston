import type { AgentConfig } from "@houston/protocol";

export const CONFIG_SEED_KEY = ".houston/config/config.json";

const HOST_OWNED_CONFIG_FIELDS = ["firstDay", "arrival"] as const;

export function keepHostOwnedConfig(
  incoming: Record<string, unknown>,
  stored: AgentConfig,
): Record<string, unknown> {
  const agrees = HOST_OWNED_CONFIG_FIELDS.every(
    (field) => incoming[field] === stored[field],
  );
  if (agrees) return incoming;
  const next: Record<string, unknown> = { ...incoming };
  for (const field of HOST_OWNED_CONFIG_FIELDS) {
    if (stored[field] === undefined) delete next[field];
    else next[field] = stored[field];
  }
  return next;
}
