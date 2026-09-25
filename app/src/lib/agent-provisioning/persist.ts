import {
  type PendingWarmingSend,
  PROVISIONING_TTL_MS,
  type ProvisioningEntry,
} from "./entry.ts";

/** Parse the persisted map, dropping expired and malformed entries. */
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
        // A timed-out entry is kept regardless of age: it's still visibly
        // parked (its board row / chat bubble persists) and re-arms its own
        // probe on rehydrate rather than expiring off the TTL clock a second
        // time, which would silently drop it right back.
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
                // A non-string prompt would reach the wire as one: a send is
                // only kept when BOTH of its candidate prompts are sound.
                ["string", "undefined"].includes(
                  typeof (s as PendingWarmingSend).prompt,
                ),
            ),
          }
        : e,
    );
}
