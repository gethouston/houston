import { useIsMobile } from "@houston-ai/core";
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
  headerCollapsesTabs,
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

export function usePageHeaderTabsCollapsed(): boolean {
  const mode = usePageHeaderMode();
  const isMobile = useIsMobile();
  return headerCollapsesTabs(mode, isMobile);
}

export function PageHeaderTools({
  children,
}: {
  children: (inStrip: boolean) => ReactNode;
}) {
  const { container, inStrip } = useContext(ToolsContext);
  const node = children(inStrip);
  return inStrip && container ? createPortal(node, container) : node;
}
