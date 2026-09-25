import { useReducedMotion } from "framer-motion";
import { type RefObject, useRef, useState } from "react";
import { carouselIndex } from "./employee-card-model";

export interface CardCarousel {
  list: RefObject<HTMLUListElement | null>;
  /** The slide a phone is showing; always 0 on a desktop grid. */
  index: number;
  onScroll: () => void;
  show: (index: number) => void;
}

/** Brings a slide into view, gliding unless the person asked for less motion. */
export function showSlide(slide: Element | null, reduce: boolean): void {
  slide?.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "nearest",
    inline: "start",
  });
}

/**
 * The phone carousel's position: which slide is showing, read from the scroll
 * as it moves, and a way to bring one into view (a pagination dot). The
 * stride is measured between the first two slides, so it follows the slide
 * width and gap the CSS gives them.
 */
export function useCardCarousel(count: number): CardCarousel {
  const list = useRef<HTMLUListElement | null>(null);
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion() ?? false;

  return {
    list,
    index,
    onScroll: () => {
      const node = list.current;
      const [first, second] = node ? Array.from(node.children) : [];
      if (!node || !(first instanceof HTMLElement)) return;
      const stride =
        second instanceof HTMLElement
          ? second.offsetLeft - first.offsetLeft
          : first.offsetWidth;
      setIndex(carouselIndex(node.scrollLeft, stride, count));
    },
    show: (next) => showSlide(list.current?.children[next] ?? null, reduce),
  };
}

/**
 * Takes the person to the name field of the `index`-th card under `root`: on
 * a phone its slide scrolls into view first, then the field takes focus.
 */
export function focusEmployeeName(
  root: HTMLElement | null,
  index: number,
  reduce: boolean,
): void {
  const field = root?.querySelectorAll<HTMLInputElement>(
    "[data-employee-name]",
  )[index];
  if (!field) return;
  showSlide(field.closest("li"), reduce);
  field.focus({ preventScroll: true });
}
