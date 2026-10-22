import type { AgentAssignment } from "@houston/engine-adapter";
import type { AgentPeople, ChartPerson } from "./org-chart-people.ts";

/**
 * The userId an agent lives under, or `null` when nobody on the roster can
 * hold it. `roster` is already in people order, so its first owner is the
 * fallback.
 */
export function agentHome(
  people: AgentPeople | null,
  roster: readonly ChartPerson[],
  assignments: readonly AgentAssignment[],
): string | null {
  const assigned = new Set(
    assignments.filter((a) => a.access === "manager").map((a) => a.userId),
  );
  const manager = people?.manages
    .filter((p) => assigned.has(p.userId))
    // Unnamed accounts share one label; the id keeps the pick deterministic.
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
    )[0];
  if (manager) return manager.userId;
  if (people && people.uses !== "everyone" && people.uses.length === 1)
    return people.uses[0].userId;
  const owner = roster.find((person) => person.role === "owner");
  return (owner ?? roster[0])?.userId ?? null;
}
