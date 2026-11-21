import { space } from "@houston/design-tokens";

export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

export const NO_EDGES: ScrollEdges = { start: false, end: false };

const SLACK = 1;

export function scrollEdges(box: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): ScrollEdges {
  if (box.clientWidth === 0) return NO_EDGES;
  return {
    start: box.scrollLeft > SLACK,
    end: box.scrollLeft + box.clientWidth < box.scrollWidth - SLACK,
  };
}

const FADE = space["48"];

export function edgeMask(edges: ScrollEdges): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const left = edges.start ? `transparent, black ${FADE}` : "black, black";
  const right = edges.end
    ? `black calc(100% - ${FADE}), transparent`
    : "black, black";
  return `linear-gradient(to right, ${left}, ${right})`;
}
