import { WorkspacePreferenceIdentityChanged } from "./workspace-selection-errors";

export type WorkspacePreferenceOperation = "read" | "write" | "device";
export type WorkspacePreferenceReporter = (
  operation: WorkspacePreferenceOperation,
  error: unknown,
) => void;

/** Shared across SDK rebuilds; an identity change invalidates queued work. */
export class WorkspaceSelectionState {
  choice = 0;
  private identity: string | null | undefined;
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();

  bind(identity: string | null): number {
    if (this.identity !== identity) {
      this.identity = identity;
      this.generation++;
      this.writes = Promise.resolve();
    }
    return this.generation;
  }

  enqueue<T>(
    user: () => string | null,
    work: (valid: () => boolean) => Promise<T>,
  ): Promise<T> {
    const identity = user();
    const generation = this.bind(identity);
    const valid = () => this.bind(user()) === generation;
    const write = () => {
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      return work(valid);
    };
    const result = this.writes.then(write, write);
    this.writes = result;
    return result;
  }
}
