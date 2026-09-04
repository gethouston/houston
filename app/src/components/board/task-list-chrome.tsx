import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The phone task list's chrome state, held ABOVE both halves of the screen.
 *
 * A team's Tasks list is drawn by the screen's BODY while its "…" menu rides
 * the drilled HEADER, and the two are siblings: the menu reveals the body's
 * search field and swaps the body into its archive. Rather than lifting the
 * whole section, the smallest shared thing lives here — whether the search
 * field is showing, and the body's own "show the archive", registered while a
 * list is actually mounted.
 *
 * `showArchive === null` is how the header knows there is no list under it:
 * every other section of a team gets no "…" chip at all.
 */
export interface TaskListChrome {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** The mounted list's archive switch, or null when no list is on screen. */
  showArchive: (() => void) | null;
  registerArchive: (show: (() => void) | null) => void;
}

const NOOP_CHROME: TaskListChrome = {
  searchOpen: false,
  setSearchOpen: () => {},
  showArchive: null,
  registerArchive: () => {},
};

const TaskListChromeContext = createContext<TaskListChrome>(NOOP_CHROME);

export function TaskListChromeProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [showArchive, setShowArchive] = useState<(() => void) | null>(null);

  const registerArchive = useCallback((show: (() => void) | null) => {
    // Stored through the updater form: a state setter given a function would
    // otherwise CALL it instead of storing it.
    setShowArchive(() => show);
    // A list leaving the screen takes its revealed search with it, so coming
    // back lands on the tasks rather than on a stale field.
    if (show === null) setSearchOpen(false);
  }, []);

  const value = useMemo<TaskListChrome>(
    () => ({ searchOpen, setSearchOpen, showArchive, registerArchive }),
    [searchOpen, showArchive, registerArchive],
  );
  return (
    <TaskListChromeContext.Provider value={value}>
      {children}
    </TaskListChromeContext.Provider>
  );
}

export function useTaskListChrome(): TaskListChrome {
  return useContext(TaskListChromeContext);
}

/**
 * Publish this list's archive switch for as long as it is mounted. `null`
 * withdraws the chip without unmounting — an empty team has no archive to
 * offer, and the archive screen carries its own way back.
 */
export function useRegisterTaskListArchive(show: (() => void) | null): void {
  const { registerArchive } = useTaskListChrome();
  useEffect(() => {
    registerArchive(show);
    return () => registerArchive(null);
  }, [registerArchive, show]);
}
