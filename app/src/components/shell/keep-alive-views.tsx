import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const IsActiveViewContext = createContext(true);

export function useIsActiveView(): boolean {
  return useContext(IsActiveViewContext);
}

export interface KeepAliveView {
  id: string;
  enabled: boolean;
  content: ReactNode;
}

export function KeepAliveViews({
  activeId,
  views,
}: {
  activeId: string;
  views: KeepAliveView[];
}) {
  const [visited, setVisited] = useState<Set<string>>(
    () =>
      new Set(
        views
          .filter((view) => view.enabled && view.id === activeId)
          .map((view) => view.id),
      ),
  );
  const enabled = new Set(
    views.filter((view) => view.enabled).map((view) => view.id),
  );

  const visible = new Set(visited);
  if (enabled.has(activeId)) visible.add(activeId);

  const previousActiveId = useRef(activeId);
  useLayoutEffect(() => {
    if (previousActiveId.current !== activeId) {
      const leftKeptAliveScreen = enabled.has(previousActiveId.current);
      const modalOpen = document.body.style.pointerEvents === "none";
      if (leftKeptAliveScreen && modalOpen) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      }
      previousActiveId.current = activeId;
    }
    setVisited((current) => {
      const next = new Set([...current].filter((id) => enabled.has(id)));
      if (enabled.has(activeId)) next.add(activeId);
      if (
        next.size === current.size &&
        [...next].every((id) => current.has(id))
      )
        return current;
      return next;
    });
  }, [activeId, enabled]);

  return views.map(
    (view) =>
      view.enabled &&
      visible.has(view.id) && (
        <div
          key={view.id}
          data-screen={view.id}
          data-screen-active={view.id === activeId ? "true" : undefined}
          className={
            view.id === activeId ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <IsActiveViewContext.Provider value={view.id === activeId}>
            {view.content}
          </IsActiveViewContext.Provider>
        </div>
      ),
  );
}
