import { useEffect, useRef } from "react";
import { useOrgNav } from "./org-nav-store";

export function usePersonFocus() {
  const focused = useOrgNav((store) => store.focusedPerson);
  const clear = useOrgNav((store) => store.clearFocusedPerson);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focused) return;
    const rows =
      listRef.current?.querySelectorAll<HTMLElement>("[data-person]");
    const row = [...(rows ?? [])].find((el) => el.dataset.person === focused);
    row?.scrollIntoView({ block: "center" });
  }, [focused]);

  useEffect(() => clear, [clear]);

  return { focused, listRef };
}
