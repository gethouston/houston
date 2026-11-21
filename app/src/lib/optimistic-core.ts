import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { holdPatchesAcrossRefetch } from "./optimistic-hold";

export interface OptimisticPatch<D = unknown> {
  queryKey: QueryKey;
  apply(current: D | undefined): D | undefined;
  revert?(current: D | undefined, before: D | undefined): D | undefined;
}

export type OptimisticBugReport = (command: string, err: unknown) => void;

export interface OptimisticFailureCopy {
  title: string;
  description: string;
}

export interface OptimisticWrite<T> {
  qc: QueryClient;
  command: string;
  patches: OptimisticPatch[];
  write: () => Promise<T>;
  failure: OptimisticFailureCopy;
  invalidate?: QueryKey[];
  onSuccess?: (result: T) => void;
  onError?: (err: unknown) => void;
}

export function runOptimisticWrite<T>(
  opts: OptimisticWrite<T>,
  refused: (command: string, err: unknown, copy: OptimisticFailureCopy) => void,
  bug: OptimisticBugReport = (command, err) =>
    console.error(`[${command}] optimistic write callback threw`, err),
): Promise<void> {
  const { qc, patches } = opts;
  const snapshots = patches.map((patch) => {
    void qc.cancelQueries({
      queryKey: patch.queryKey,
      predicate: (query) => query.state.data !== undefined,
    });
    const before = qc.getQueriesData({ queryKey: patch.queryKey });
    qc.setQueriesData({ queryKey: patch.queryKey }, patch.apply);
    return { patch, before };
  });
  const release = holdPatchesAcrossRefetch(qc, patches);
  const rollback = () => {
    for (const { patch, before } of snapshots) {
      const reverted = new Set(
        before
          .filter(([, data]) => data !== undefined)
          .map(([k]) => hashKey(k)),
      );
      for (const query of qc
        .getQueryCache()
        .findAll({ queryKey: patch.queryKey })) {
        if (reverted.has(query.queryHash)) continue;
        void qc.invalidateQueries({ queryKey: query.queryKey, exact: true });
      }
    }
    for (const { patch, before } of [...snapshots].reverse()) {
      for (const [queryKey, data] of before) {
        if (patch.revert) {
          const revert = patch.revert.bind(patch);
          qc.setQueryData(queryKey, (current: unknown) =>
            revert(current, data),
          );
        } else qc.setQueryData(queryKey, data);
      }
    }
  };
  const guarded = (step: () => void) => {
    try {
      step();
    } catch (err) {
      bug(opts.command, err);
    }
  };
  const refresh = () => {
    for (const queryKey of opts.invalidate ?? patches.map((p) => p.queryKey)) {
      void qc.invalidateQueries({ queryKey });
    }
  };

  let sent: Promise<T>;
  try {
    sent = opts.write();
  } catch (err) {
    sent = Promise.reject(err);
  }
  return sent.then(
    (result) => {
      release();
      refresh();
      guarded(() => opts.onSuccess?.(result));
    },
    (err: unknown) => {
      release();
      guarded(rollback);
      refresh();
      guarded(() => refused(opts.command, err, opts.failure));
      guarded(() => opts.onError?.(err));
    },
  );
}
