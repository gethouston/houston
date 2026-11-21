export interface SliceCoverage {
  noteRead(agentPaths: readonly string[]): void;
  wasRead(agentPath: string): boolean;
  reset(): void;
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

export const sliceCoverage: SliceCoverage = createSliceCoverage();
