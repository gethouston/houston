import { type Ref, useCallback, useLayoutEffect, useState } from "react";

export interface PlaceholderFit {
  textWidth: number;
  availableWidth: number;
}

const UNMEASURED: PlaceholderFit = {
  textWidth: Number.POSITIVE_INFINITY,
  availableWidth: 0,
};

let measureCanvas: HTMLCanvasElement | null = null;

function textWidth(text: string, font: string): number {
  measureCanvas ??= document.createElement("canvas");
  const context = measureCanvas.getContext("2d");
  if (!context) return Number.POSITIVE_INFINITY;
  context.font = font;
  return context.measureText(text).width;
}

function measure(input: HTMLInputElement, text: string): PlaceholderFit {
  const style = getComputedStyle(input);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  return {
    textWidth: textWidth(text, font),
    availableWidth: Math.max(0, input.clientWidth - padding),
  };
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export function useFittingPlaceholder(
  text: string,
  forwarded?: Ref<HTMLInputElement>,
): { ref: (node: HTMLInputElement | null) => void; fit: PlaceholderFit } {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [fit, setFit] = useState<PlaceholderFit>(UNMEASURED);

  const ref = useCallback(
    (node: HTMLInputElement | null) => {
      setInput(node);
      assignRef(forwarded, node);
    },
    [forwarded],
  );

  useLayoutEffect(() => {
    if (!input) return;
    const update = () => {
      const next = measure(input, text);
      setFit((current) =>
        current.textWidth === next.textWidth &&
        current.availableWidth === next.availableWidth
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(input);
    return () => observer.disconnect();
  }, [input, text]);

  return { ref, fit };
}
