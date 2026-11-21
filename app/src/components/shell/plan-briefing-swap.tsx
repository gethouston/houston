import { cn } from "@houston-ai/core";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

export function useSwapped(key: string): boolean {
  const [seen, setSeen] = useState({ key, swapped: false });
  if (seen.key !== key) {
    setSeen({ key, swapped: true });
    return true;
  }
  return seen.swapped;
}

export function BriefingStep({
  step,
  children,
}: {
  step: string;
  children: ReactNode;
}) {
  const swapped = useSwapped(step);
  const lastInput = useRef<"keyboard" | "pointer">("pointer");
  return (
    <StepBody key={step} swapped={swapped} lastInput={lastInput}>
      {children}
    </StepBody>
  );
}

function StepBody({
  swapped,
  lastInput,
  children,
}: {
  swapped: boolean;
  lastInput: RefObject<"keyboard" | "pointer">;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!swapped || !ref.current) return;
    const target =
      ref.current.querySelector<HTMLElement>('input[type="radio"]:checked') ??
      ref.current.querySelector<HTMLElement>("h2[tabindex]");
    target?.focus({ focusVisible: lastInput.current === "keyboard" });
  }, [swapped, lastInput]);
  return (
    <div
      ref={ref}
      onKeyDownCapture={() => {
        lastInput.current = "keyboard";
      }}
      onPointerDownCapture={() => {
        lastInput.current = "pointer";
      }}
      className={cn("flex flex-1 flex-col", swapped && "plan-briefing-step")}
    >
      {children}
    </div>
  );
}
