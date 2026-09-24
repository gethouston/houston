import {
  composite,
  contrast,
  formatColor,
  mix,
  parseColor,
  withAlpha,
} from "./color.mjs";

// The contrast ladder every imported palette is measured against: the surfaces
// Houston paints information on, and the nudge that walks a hue toward an extreme
// until it clears a WCAG floor on all of them. An imported palette is tuned for a
// terminal, where text sits on one flat background; Houston sets the same hue on
// four rows and on chips washed with a hue behind it, so a role worn AS TEXT is
// legible only once it clears the floor on every one of those composites.

export const BODY_FLOOR = 4.5;
const STEP = 0.02;
const STEPS = 50;

/** The surfaces Houston paints information on, flattened to opaque colours. */
export function surfaceStack(surfaces) {
  const screen = composite(surfaces.background, surfaces.base);
  const all = [
    screen,
    composite(surfaces.input, screen),
    composite(surfaces.chip, screen),
    composite(surfaces["chip-subtle"], screen),
  ];
  return {
    all,
    /**
     * A chip washes a hue behind its own text, which tints the backdrop TOWARDS
     * that text — a role measured only against the plain rows is measured
     * against the easiest case, so the wash is part of its floor.
     */
    washes: (hue, alphas) =>
      alphas.flatMap((alpha) =>
        all.map((row) => composite(withAlpha(hue, alpha), row)),
      ),
  };
}

/**
 * Step `from` toward `toward` in 2% mixes until it clears `floor` on every
 * surface. `toward` is the palette's own ink for a role worn on a surface, and
 * white for the label on the dark frost button; either way it is the extreme the
 * role is heading for, so contrast rises monotonically and the ladder's last
 * rung is that extreme itself. A palette that misses the floor even there is a
 * build error, not a silently unreadable block.
 *
 * `surfacesFor` is re-read at every rung rather than taken once, because a role
 * that washes ITSELF behind its own text (`--ht-link` under `bg-link/10`) drags
 * its own backdrop along as it moves.
 *
 * Every rung is snapped to the colour the CSS will ship before it is measured: a
 * float mix that clears the floor by hundredths can fall under it once it is
 * written as eight-bit hex, and the hex is what the user reads.
 *
 * @param {(value: import("./color.mjs").Rgba) => import("./color.mjs").Rgba[]} surfacesFor
 * @returns {{ value: import("./color.mjs").Rgba, steps: number }}
 */
export function nudge(from, toward, surfacesFor, floor, label) {
  for (let step = 0; step <= STEPS; step += 1) {
    const value = parseColor(formatColor(mix(from, toward, step * STEP)));
    if (surfacesFor(value).every((s) => contrast(value, s) >= floor)) {
      return { value, steps: step };
    }
  }
  throw new Error(
    `${label}: cannot reach ${floor}:1 on every surface, even at ${formatColor(toward)}`,
  );
}

/**
 * Bind the ladder to one palette: the returned `step(role, from, floor, extra)`
 * walks `from` toward that palette's own ink until it clears `floor` on every
 * row, plus whatever washes `extra` says the role is printed on, and notes how
 * far it had to travel.
 *
 * @param {Record<string, string> & { id: string, foreground: string }} p
 * @param {import("./color.mjs").Rgba[]} rows the palette's plain surfaces
 * @param {string[]} notes
 */
export function inkStepper(p, rows, notes) {
  return (role, from, floor, extra = () => []) => {
    const { value, steps } = nudge(
      from,
      p.foreground,
      (candidate) => [...rows, ...extra(candidate)],
      floor,
      `${p.id}: --ht-${role}`,
    );
    if (steps > 0) {
      notes.push(
        `${p.id}: ${role} ${formatColor(from)} -> ${formatColor(value)} (${steps * 2}% toward ink, floor ${floor}:1)`,
      );
    }
    return value;
  };
}
