import type { Activity } from "../data/activity.ts";
import { applyActivityPatch } from "../data/activity-bulk.ts";
import type { OptimisticPatch } from "./optimistic-core.ts";
import { queryKeys } from "./query-keys.ts";
import { restoreFields, revertRows } from "./row-revert.ts";

export type MissionGroups = Readonly<Record<string, readonly string[]>>;

export interface MissionEdit {
  status?: string;
  title?: string;
}

interface AggregateRow
  extends Pick<Activity, "id" | "updated_at" | "last_message_at"> {
  agent_path: string;
}

const activityKey = (row: Activity) => row.id;
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

export function missionEditPatches(
  groups: MissionGroups,
  edit: MissionEdit,
  timestamp: string,
): OptimisticPatch[] {
  const sets = idSets(groups);
  const fields = Object.fromEntries(
    Object.entries(edit).filter(([, value]) => value !== undefined),
  );
  const edited = [...Object.keys(fields), "updated_at"];
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
