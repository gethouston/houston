import type { Workspace } from "../lib/types";

export type LocaleWriteOutcome = "saved" | "superseded";

export interface LocaleWriteDeps {
  read: (id: string) => string | null | undefined;
  swap: (id: string, next: (w: Workspace) => Workspace) => void;
  write: (id: string, locale: string | null) => Promise<Workspace>;
}

interface Run {
  issued: number;
  pending: number;
  confirmed: string | null | undefined;
  confirmedSeq: number;
  newestRefused: boolean;
}

export function workspaceLocaleWrites(deps: LocaleWriteDeps) {
  const runs = new Map<string, Run>();
  return async (
    id: string,
    locale: string | null,
  ): Promise<LocaleWriteOutcome> => {
    const run: Run = runs.get(id) ?? {
      issued: 0,
      pending: 0,
      confirmed: deps.read(id),
      confirmedSeq: 0,
      newestRefused: false,
    };
    runs.set(id, run);
    const seq = ++run.issued;
    run.pending++;
    run.newestRefused = false;
    deps.swap(id, (w) => ({ ...w, locale }));
    try {
      const updated = await deps.write(id, locale);
      if (seq > run.confirmedSeq) {
        run.confirmedSeq = seq;
        run.confirmed = updated.locale;
        if (seq === run.issued || run.newestRefused)
          deps.swap(id, () => updated);
      }
      return seq === run.issued ? "saved" : "superseded";
    } catch (err) {
      if (seq !== run.issued) return "superseded";
      run.newestRefused = true;
      deps.swap(id, (w) => ({ ...w, locale: run.confirmed }));
      throw err;
    } finally {
      if (--run.pending === 0) runs.delete(id);
    }
  };
}
