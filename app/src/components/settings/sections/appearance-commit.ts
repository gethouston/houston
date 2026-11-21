import { sameTheme, type ThemePreference } from "@houston/sdk/appearance";

export const APPEARANCE_COMMIT_DELAY_MS = 250;

export type CommitScheduler = (fn: () => void) => () => void;

const defaultScheduler: CommitScheduler = (fn) => {
  const id = setTimeout(fn, APPEARANCE_COMMIT_DELAY_MS);
  return () => clearTimeout(id);
};

export interface AppearanceCommitDeps {
  apply: (pref: ThemePreference) => void;
  persist: (
    patch: Partial<ThemePreference>,
    previous: ThemePreference,
  ) => Promise<ThemePreference>;
  report: (label: string, err: unknown) => void;
  schedule?: CommitScheduler;
}

export interface AppearanceCommitter {
  commit(patch: Partial<ThemePreference>): void;
  dispose(): void;
}

export function createAppearanceCommitter(
  saved: ThemePreference,
  onPref: (pref: ThemePreference) => void,
  deps: AppearanceCommitDeps,
): AppearanceCommitter {
  const { apply, persist, report } = deps;
  const schedule = deps.schedule ?? defaultScheduler;

  let painted = saved;
  let stored = saved;
  let cancel: (() => void) | null = null;
  let writing = false;
  let closed = false;

  const show = (pref: ThemePreference): void => {
    if (closed) return;
    apply(pref);
    onPref(pref);
  };

  const write = (): void => {
    if (writing || sameTheme(painted, stored)) return;
    writing = true;
    const attempt = painted;
    void persist(attempt, stored)
      .then((next) => {
        stored = next;
      })
      .catch((err: unknown) => {
        report("set_theme_preference", err);
        if (!sameTheme(painted, attempt)) return;
        painted = stored;
        show(stored);
      })
      .finally(() => {
        writing = false;
        if (sameTheme(painted, stored)) return;
        if (closed) return void write();
        show(painted);
        arm();
      });
  };

  const arm = (): void => {
    cancel?.();
    cancel = schedule(() => {
      cancel = null;
      write();
    });
  };

  return {
    commit(patch) {
      if (closed) return;
      painted = { ...painted, ...patch };
      show(painted);
      arm();
    },
    dispose() {
      if (closed) return;
      closed = true;
      cancel?.();
      cancel = null;
      write();
    },
  };
}
