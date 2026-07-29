/**
 * Close a portal-rendered menu on Escape, from wherever focus happens to be.
 *
 * The menus render into `document.body` and never take focus, so a React
 * `onKeyDown` on the menu element can only fire if something inside it is
 * focused, which never happens: the key event stays with the row or the kebab
 * button that opened it. Listening on the document is the only placement that
 * actually reaches the keystroke.
 */
import { useEffect, useRef } from "react";

export function useEscapeDismiss(onClose: () => void): void {
  // Callers pass an inline arrow, so keep the listener subscribed once and
  // read the latest handler through a ref instead of re-binding every render.
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
