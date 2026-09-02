import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

/**
 * The phone top bar's title slot: the element between the drawer control and
 * the compose control that the active screen's `PageHeader` portals its
 * identity lozenge into below the breakpoint. Registered by `MobileTopBar`
 * and read by `PageHeader`; `null` whenever the bar is not on the glass (a
 * pushed chat hides it), in which case the header stays in its own strip.
 */
const SlotContext = createContext<HTMLElement | null>(null);
const RegisterContext = createContext<(element: HTMLElement | null) => void>(
  () => {},
);

export function MobileHeaderSlotProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const register = useCallback(
    (element: HTMLElement | null) =>
      setSlot((current) => (current === element ? current : element)),
    [],
  );
  return (
    <RegisterContext.Provider value={register}>
      <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
    </RegisterContext.Provider>
  );
}

export function useMobileHeaderSlot(): HTMLElement | null {
  return useContext(SlotContext);
}

export function useMobileHeaderSlotRef(): (
  element: HTMLElement | null,
) => void {
  return useContext(RegisterContext);
}
