import {
  type PendingWarmingSend,
  PROVISIONING_TTL_MS,
  type ProvisioningEntry,
} from "./entry.ts";

export function parsePersistedProvisioning(
  raw: string | null,
  now: number,
): ProvisioningEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((e): e is ProvisioningEntry => {
      if (!e || typeof e !== "object") return false;
      const { agentId, agentPath, since, timedOut } =
        e as Partial<ProvisioningEntry>;
      return (
        typeof agentId === "string" &&
        typeof agentPath === "string" &&
        typeof since === "number" &&
        (timedOut === true || now - since < PROVISIONING_TTL_MS)
      );
    })
    .map((e) =>
      Array.isArray(e.pendingSends)
        ? {
            ...e,
            pendingSends: e.pendingSends.filter(
              (s): s is PendingWarmingSend =>
                !!s &&
                typeof s === "object" &&
                typeof (s as PendingWarmingSend).id === "string" &&
                typeof (s as PendingWarmingSend).sessionKey === "string" &&
                typeof (s as PendingWarmingSend).text === "string" &&
                ["string", "undefined"].includes(
                  typeof (s as PendingWarmingSend).prompt,
                ),
            ),
          }
        : e,
    );
}
