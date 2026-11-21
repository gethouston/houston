import { useEffect, useRef } from "react";

export function useEscapeDismiss(onClose: () => void): void {
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
