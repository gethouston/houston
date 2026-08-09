import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type HeaderMode,
  type HeaderThresholds,
  headerHoldsTools,
  headerMode,
} from "./page-header-layout";

interface ToolsValue {
  container: HTMLElement | null;
  mode: HeaderMode;
  inStrip: boolean;
}

type SlotName = "strip" | "tools";
type Slots = Record<SlotName, HTMLElement | null>;

const ToolsContext = createContext<ToolsValue>({
  container: null,
  mode: "stacked",
  inStrip: false,
});
const RegisterContext = createContext<
  (name: SlotName, element: HTMLElement | null) => void
>(() => {});

/** Wraps the header and body, so body-owned tools can reach the strip. */
export function PageHeaderToolsProvider({
  thresholds,
  children,
}: {
  thresholds: HeaderThresholds;
  children: ReactNode;
}) {
  const [slots, setSlots] = useState<Slots>({ strip: null, tools: null });
  const [width, setWidth] = useState<number | null>(null);
  const register = useCallback(
    (name: SlotName, element: HTMLElement | null) =>
      setSlots((current) =>
        current[name] === element ? current : { ...current, [name]: element },
      ),
    [],
  );

  const strip = slots.strip;
  // A layout effect lands the first measurement before paint, avoiding a wide
  // header painting stacked and then snapping into one row.
  useLayoutEffect(() => {
    if (!strip) {
      setWidth(null);
      return;
    }
    const update = () => setWidth(strip.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [strip]);

  const value = useMemo(() => {
    const mode = headerMode(width, thresholds);
    return {
      container: slots.tools,
      mode,
      inStrip: headerHoldsTools(mode),
    };
  }, [slots.tools, thresholds, width]);

  return (
    <RegisterContext.Provider value={register}>
      <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>
    </RegisterContext.Provider>
  );
}

export function usePageHeaderSlotRef(name: SlotName) {
  const register = useContext(RegisterContext);
  return useMemo(
    () => (element: HTMLElement | null) => register(name, element),
    [name, register],
  );
}

export function usePageHeaderMode(): HeaderMode {
  return useContext(ToolsContext).mode;
}

/**
 * Crossing the strip threshold switches between portal and inline ownership,
 * which remounts this subtree. Controlled field values survive; focus does not.
 */
export function PageHeaderTools({
  children,
}: {
  children: (inStrip: boolean) => ReactNode;
}) {
  const { container, inStrip } = useContext(ToolsContext);
  const node = children(inStrip);
  return inStrip && container ? createPortal(node, container) : node;
}
