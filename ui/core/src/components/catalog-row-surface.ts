import { cn } from "../utils";

/**
 * How a `CatalogRow` paints itself at REST — the row's surface vocabulary, kept
 * apart from the row so the component reads as structure and this reads as
 * look. One place decides everything the choice implies, because the two halves
 * are a pair: where the surface goes, the focus ring has to follow.
 *
 * `plane` is the flat catalog row: transparent until hovered, for the dense
 * browse lists where the LIST is the surface and a row is a line in it.
 *
 * `card` is a self-contained clickable card, for rows that carry their own
 * tiers (a `below` of live detail) and open the thing they describe. Such a row
 * must READ as pressable before it is touched — an affordance that only appears
 * on hover is no affordance at all — so it paints a surface and a hairline at
 * rest and answers a press with a scale. The hover wash is identical either
 * way; `card` only gives it something to enhance instead of something to
 * reveal.
 */
export type CatalogRowSurface = "plane" | "card";

/** The classes a surface choice contributes, split by where they land: the row
 *  ROOT (which owns the fill, the ring and the press) and the row BODY button
 *  (which owns the focus ring only when the root has no surface of its own).
 *  `interactive` is whether the row actually opens something — a row that does
 *  nothing must not claim a press response. */
export function catalogRowSurfaceClasses(
  surface: CatalogRowSurface,
  interactive: boolean,
): { root: string; body: string } {
  if (surface === "plane")
    return {
      root: "",
      body: "focus-visible:ring-2 focus-visible:ring-focus/40",
    };
  return {
    root: cn(
      "bg-card outline-1 -outline-offset-1 outline-line",
      "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus",
      interactive && "active:scale-[0.98]",
    ),
    body: "",
  };
}
