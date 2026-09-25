/**
 * Which agents' slices of the cross-agent board come from a read made this
 * session.
 *
 * A partial sweep resolves rather than failing: an agent whose read failed
 * keeps its last-known rows (`foldSweep`), which may be a disk-restored copy
 * from an earlier session or nothing at all. Those rows can be missing tasks
 * that exist, and the next good read fills them in. A reader that compares the
 * board against a snapshot of one agent's tasks (the Academy's email lesson
 * noting the sender's) must take that snapshot only from a slice read here, or
 * the filled-in old tasks look brand new.
 *
 * Bookkeeping beside the query cache, like `all-conversations-freshness.ts`:
 * the sweep and the push-event patch note every slice they read.
 * Dependency-free so `node --test` exercises it.
 */

export interface SliceCoverage {
  /** These agents' slices were just read in full. */
  noteRead(agentPaths: readonly string[]): void;
  /** Whether the agent's slice has been read in full this session. */
  wasRead(agentPath: string): boolean;
  /** Forget every read: the identity changed, and its board is read afresh. */
  reset(): void;
  /**
   * Be told whenever what was read changes. A read that finds the rows the
   * board already held leaves the rows untouched, so a reader waiting on a
   * slice's first read listens here, not to the rows. Returns the unsubscribe.
   */
  subscribe(listener: () => void): () => void;
}

export function createSliceCoverage(): SliceCoverage {
  const read = new Set<string>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    noteRead(agentPaths) {
      const size = read.size;
      for (const path of agentPaths) read.add(path);
      if (read.size !== size) changed();
    },
    wasRead(agentPath) {
      return read.has(agentPath);
    },
    reset() {
      if (read.size === 0) return;
      read.clear();
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app-wide instance: one board, one ledger. */
export const sliceCoverage: SliceCoverage = createSliceCoverage();
