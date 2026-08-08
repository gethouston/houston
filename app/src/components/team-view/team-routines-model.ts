import type {
  Routine,
  RoutineRun,
  TriggerStatusItem,
} from "@houston-ai/engine-client";
import type { Agent } from "../../lib/types.ts";
import { latestRunByRoutine } from "../agent/routines-tab-model.ts";

/**
 * Turning several agents' routine lists into ONE list, and finding the way
 * back. Pure and DOM-free, so the two things a cross-agent list must never get
 * wrong — the order rows appear in, and which agent a row belongs to — are unit
 * tested (`app/tests/team-routines-model.test.ts`) rather than eyeballed.
 *
 * Aggregating is honest here: a routine is a flat row, so a team's routines
 * really are one list. (A team's FILES are not: folders nest, and merging trees
 * would invent a filesystem nobody has. That section picks one agent instead.)
 */

/** Separator between an owner's id and the routine's own id in a row key. */
const KEY_SEP = "::";

/**
 * A row's identity in the merged list. Two agents can hold routines with the
 * SAME id (ids are unique per agent, not per workspace), so a merged list keyed
 * on the bare routine id would light two rows at once and route an action to
 * whichever agent happened to come first. The owner is part of the key.
 */
export function teamRoutineKey(agentId: string, routineId: string): string {
  return `${agentId}${KEY_SEP}${routineId}`;
}

/** The owner id and routine id behind a row key, `null` for anything else. */
export function parseTeamRoutineKey(
  key: string,
): { agentId: string; routineId: string } | null {
  const at = key.indexOf(KEY_SEP);
  if (at <= 0) return null;
  const agentId = key.slice(0, at);
  const routineId = key.slice(at + KEY_SEP.length);
  return routineId ? { agentId, routineId } : null;
}

/** One team agent's answer to the two routine reads behind the section. */
export interface TeamRoutinesEntry {
  agent: Agent;
  /** `undefined` while the agent's routines query is still loading or failed. */
  routines: Routine[] | undefined;
  /** `undefined` while the agent's runs query is still loading or failed. */
  runs: RoutineRun[] | undefined;
}

export interface TeamRoutinesList {
  /** Every team agent's routines as ONE list, in render order, each row's `id`
   *  replaced by its {@link teamRoutineKey} so a row is unambiguous. */
  routines: Routine[];
  /** The agent behind each row key. */
  ownerOf: Record<string, Agent>;
  /** The routine id each row key stands for, on the owning agent. */
  routineIdOf: Record<string, string>;
  /** Latest run per row key, ready for `RoutinesGrid`'s `lastRuns`. */
  lastRuns: Record<string, RoutineRun>;
}

/**
 * Merge the entries into the one list the section renders.
 *
 * Order is `enabled first, then name, then owner name` — the same enabled-first
 * ordering the single-agent list uses, so a person moving between the two reads
 * the same shape, with the owner as the only new tiebreak. Sorting HERE rather
 * than leaning on the grid's own sort is deliberate: the grid's tiebreak would
 * be whatever order the fan-out happened to resolve in, which is not an order a
 * person can predict.
 */
export function aggregateTeamRoutines(
  entries: TeamRoutinesEntry[],
): TeamRoutinesList {
  const routines: Routine[] = [];
  const ownerOf: Record<string, Agent> = {};
  const routineIdOf: Record<string, string> = {};
  const lastRuns: Record<string, RoutineRun> = {};

  for (const { agent, routines: own, runs } of entries) {
    const latest = latestRunByRoutine(runs);
    for (const routine of own ?? []) {
      const key = teamRoutineKey(agent.id, routine.id);
      routines.push({ ...routine, id: key });
      ownerOf[key] = agent;
      routineIdOf[key] = routine.id;
      const run = latest[routine.id];
      if (run) lastRuns[key] = run;
    }
  }

  routines.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return ownerOf[a.id].name.localeCompare(ownerOf[b.id].name);
  });

  return { routines, ownerOf, routineIdOf, lastRuns };
}

/**
 * Each owner's EVENT-driven routines, back in that owner's own id space.
 *
 * The merged list is keyed by row, but the trigger-status route only knows an
 * agent's own routine ids, so the fan-out has to translate back before it can
 * ask. An agent with no event routine is simply absent here, and that absence
 * is what keeps it from being asked at all.
 */
export function teamTriggerRoutineIds(
  list: TeamRoutinesList,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of list.routines) {
    if (!row.trigger) continue;
    const agentId = list.ownerOf[row.id]?.id;
    const routineId = list.routineIdOf[row.id];
    if (!agentId || !routineId) continue;
    const owned = out[agentId] ?? [];
    owned.push(routineId);
    out[agentId] = owned;
  }
  return out;
}

/** One owner's answer to the trigger-status read, as the fan-out reports it. */
export interface TeamTriggerStatusRead {
  agentId: string;
  /** `null` when the host serves no triggers, `undefined` while unanswered. */
  items: TriggerStatusItem[] | null | undefined;
}

/**
 * Every owner's trigger status, re-keyed onto the rows the grid actually
 * renders. Two agents can hold routines with the SAME id, so a merged list fed
 * the raw `routine_id`s would paint one agent's chip with another agent's
 * health — the same collision {@link teamRoutineKey} exists to prevent.
 *
 * An unanswered or unsupported read contributes nothing rather than a
 * placeholder: absence is precisely what the verification timeout resolves, and
 * inventing a status here would be the lie that timeout was built to stop.
 */
export function teamTriggerStatusItems(
  reads: TeamTriggerStatusRead[],
): TriggerStatusItem[] {
  const out: TriggerStatusItem[] = [];
  for (const { agentId, items } of reads) {
    for (const item of items ?? []) {
      out.push({
        ...item,
        routine_id: teamRoutineKey(agentId, item.routine_id),
      });
    }
  }
  return out;
}
