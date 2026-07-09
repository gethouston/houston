/**
 * useSectionFlash — drives the editor's "the agent just changed this" moment.
 *
 * When the routine open in the editor is modified from OUTSIDE the form (the
 * setup chat's agent edits it), the consumer passes which sections changed +
 * a fresh nonce. The hook applies the `routine-section-flash` animation class
 * to those sections and scrolls the first one into view when it's off-screen
 * (`block: "nearest"` — an already-visible section doesn't move). The class is
 * dropped for one frame before re-applying so back-to-back edits to the same
 * section restart the CSS animation instead of silently coalescing.
 */
import { useEffect, useRef, useState } from "react";

/** The editor's flashable regions: the name+prompt hero, the schedule card,
 *  and the behavior card. */
export type RoutineEditorSection = "details" | "schedule" | "behavior";

export interface SectionFlash {
  sections: RoutineEditorSection[];
  /** Monotonic per change — a repeat of the same sections still re-flashes. */
  nonce: number;
}

/** Matches the `routine-section-flash` animation length, plus slack. */
const FLASH_MS = 1400;

export function useSectionFlash(flash: SectionFlash | null | undefined) {
  const refs = useRef<Record<RoutineEditorSection, HTMLElement | null>>({
    details: null,
    schedule: null,
    behavior: null,
  });
  const [active, setActive] = useState<SectionFlash | null>(null);

  useEffect(() => {
    if (!flash || flash.sections.length === 0) return;
    setActive(null); // drop the class for a frame so the animation restarts
    const raf = requestAnimationFrame(() => {
      setActive(flash);
      const first = flash.sections[0];
      if (first) {
        refs.current[first]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    });
    const timer = setTimeout(() => setActive(null), FLASH_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [flash]);

  return {
    /** Ref callback registering a section's element for the scroll. */
    refFor:
      (section: RoutineEditorSection) =>
      (el: HTMLElement | null): void => {
        refs.current[section] = el;
      },
    /** True while `section` should carry the flash animation class. */
    isFlashing: (section: RoutineEditorSection): boolean =>
      active?.sections.includes(section) ?? false,
  };
}
