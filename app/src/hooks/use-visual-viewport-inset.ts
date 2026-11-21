import { type RefObject, useEffect, useState } from "react";

export function useVisualViewportInset(
  ref: RefObject<HTMLElement | null>,
): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const bottom = element.getBoundingClientRect().bottom;
      const visibleBottom = viewport.offsetTop + viewport.height;
      setInset(Math.max(0, Math.round(bottom - visibleBottom)));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return inset;
}
