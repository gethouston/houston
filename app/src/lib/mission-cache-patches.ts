/**
 * The cache edits an optimistic mission write paints: the same card lives in
 * TWO caches, the agent's own activity list and every roster variant of the
 * cross-agent aggregate (Mission Control, the archive, sidebar badges, the
 * command palette), so every write patches both or a surface lags the click.
 *
 * Pure and dependency-light so `node --test` exercises it. Every `apply` is
 * idempotent and returns its input untouched when nothing matches: the hold
 * re-runs it over each write that lands while the host has not answered.
 */

import type { Activity } from "../data/activity.ts";
import { applyActivityPatch } from "../data/activity-bulk.ts";
import type { OptimisticPatch } from "./optimistic-core.ts";
import { queryKeys } from "./query-keys.ts";
import { restoreFields, revertRows } from "./row-revert.ts";

/** Mission ids by the agent that owns them (`groupIdsByAgent`'s shape). */
export type MissionGroups = Readonly<Record<string, readonly string[]>>;

/** What a user-initiated card write changes: a move or a rename. */
export interface MissionEdit {
  status?: string;
  title?: string;
}

interface AggregateRow
  extends Pick<Activity, "id" | "updated_at" | "last_message_at"> {
  agent_path: string;
}

const activityKey = (row: Activity) => row.id;
// Mission ids are per agent: two agents' rows can share one.
const aggregateKey = (row: AggregateRow) => `${row.agent_path}\u0000${row.id}`;

function idSets(groups: MissionGroups): Map<string, ReadonlySet<string>> {
  return new Map(
    Object.entries(groups).map(([agentPath, ids]) => [agentPath, new Set(ids)]),
  );
}

function owns(
  sets: Map<string, ReadonlySet<string>>,
  row: AggregateRow,
): boolean {
  return sets.get(row.agent_path)?.has(row.id) ?? false;
}

/** Map only the matching rows; the input itself when none match. */
function mapMatching<R>(
  rows: R[] | undefined,
  matches: (row: R) => boolean,
  edit: (row: R) => R,
): R[] | undefined {
  if (!rows?.some(matches)) return rows;
  return rows.map((row) => (matches(row) ? edit(row) : row));
}

function dropMatching<R>(
  rows: R[] | undefined,
  matches: (row: R) => boolean,
): R[] | undefined {
  if (!rows?.some(matches)) return rows;
  return rows.filter((row) => !matches(row));
}

/** Take the missions off every board that paints them. */
export function missionRemovalPatches(
  groups: MissionGroups,
): OptimisticPatch[] {
  const sets = idSets(groups);
  return [
    ...[...sets].map(
      ([agentPath, ids]): OptimisticPatch<Activity[]> => ({
        queryKey: queryKeys.activity(agentPath),
        apply: (rows) => dropMatching(rows, (row) => ids.has(row.id)),
        revert: (rows, before) =>
          revertRows(rows, before, {
            keyOf: activityKey,
            touched: (row) => ids.has(row.id),
          }),
      }),
    ),
    {
      queryKey: queryKeys.allConversations([]),
      apply: (rows: AggregateRow[] | undefined) =>
        dropMatching(rows, (row) => owns(sets, row)),
      revert: (
        rows: AggregateRow[] | undefined,
        before: AggregateRow[] | undefined,
      ) =>
        revertRows(rows, before, {
          keyOf: aggregateKey,
          touched: (row) => owns(sets, row),
        }),
    },
  ];
}

/**
 * Move or rename the missions on every board that paints them. The agent's
 * own rows take the host's merge rule (`applyActivityPatch`, which also
 * clears a blocking interaction on a move to done); the aggregate's rows
 * carry only what a card shows. `timestamp` is fixed per write so a re-run
 * stamps the same `updated_at`.
 */
export function missionEditPatches(
  groups: MissionGroups,
  edit: MissionEdit,
  timestamp: string,
): OptimisticPatch[] {
  const sets = idSets(groups);
  const fields = Object.fromEntries(
    Object.entries(edit).filter(([, value]) => value !== undefined),
  );
  // A refusal restores only what this edit wrote: a teammate's change to
  // another field of the same card stays. A move to done also strips the
  // card's blocking steps (`applyActivityPatch`).
  const edited = [...Object.keys(fields), "updated_at"];
  // A move may have stripped the card's question; it comes back only if the
  // card still has none, so one the agent raised mid-write survives.
  const restoreOwn = (row: Activity, old: Activity): Activity => {
    const next = restoreFields(row, old, edited);
    if (
      edit.status !== undefined &&
      row.pending_interaction === undefined &&
      old.pending_interaction !== undefined
    )
      next.pending_interaction = old.pending_interaction;
    return next;
  };
  return [
    ...[...sets].map(
      ([agentPath, ids]): OptimisticPatch<Activity[]> => ({
        queryKey: queryKeys.activity(agentPath),
        apply: (rows) =>
          mapMatching(
            rows,
            (row) => ids.has(row.id),
            (row) => applyActivityPatch(row, edit, timestamp),
          ),
        revert: (rows, before) =>
          revertRows(rows, before, {
            keyOf: activityKey,
            touched: (row) => ids.has(row.id),
            restore: restoreOwn,
            reinsert: false,
          }),
      }),
    ),
    {
      queryKey: queryKeys.allConversations([]),
      apply: (rows: AggregateRow[] | undefined) =>
        mapMatching(
          rows,
          (row) => owns(sets, row),
          (row) => ({
            ...row,
            ...fields,
            last_message_at: row.last_message_at ?? row.updated_at ?? timestamp,
            updated_at: timestamp,
          }),
        ),
      revert: (
        rows: AggregateRow[] | undefined,
        before: AggregateRow[] | undefined,
      ) =>
        revertRows(rows, before, {
          keyOf: aggregateKey,
          touched: (row) => owns(sets, row),
          restore: (row, old) => restoreFields(row, old, edited),
          reinsert: false,
        }),
    },
  ];
}
