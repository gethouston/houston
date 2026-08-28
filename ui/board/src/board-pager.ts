/**
 * Pure geometry for the phone board pager: which page a snap-scrolling
 * container is resting on, given each page's scroll offset. Kept out of the
 * component so the rule is unit-testable without a DOM.
 */

/**
 * The page whose offset is nearest to `scrollLeft`. Offsets are each page's
 * left edge in the container's scroll coordinates (first page at 0); an empty
 * list answers 0 so a caller never indexes with -1.
 */
export function nearestPageIndex(
  scrollLeft: number,
  pageOffsets: number[],
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  pageOffsets.forEach((offset, index) => {
    const distance = Math.abs(offset - scrollLeft);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
