import { composite, contrast, formatColor, mix, withAlpha } from "./color.mjs";

// The text half of the palette derivation: ink, the roles that simply ARE the
// palette's foreground or background, the status hues, and the contrast nudging
// that makes an imported hue legible on Houston's surfaces. An imported palette
// is tuned for a terminal, where text sits on one flat background; Houston sets
// the same hue on a field, a translucent screen, a recessed row and a chip
// washed with that hue itself, so the roles worn AS TEXT are stepped toward the
// palette's own ink until they clear the WCAG floor on every one of them.

const BODY_FLOOR = 4.5;
const MUTED_FLOOR = 3;
const STEP = 0.02;
const STEPS = 50;

/** The alphas a status chip washes its own hue at (`bg-success/15`, `bg-danger/10`). */
const WASH_ALPHAS = [0.15, 0.1];

/** The surfaces Houston paints information on, flattened to opaque colours. */
function surfaceStack(surfaces) {
  const screen = composite(surfaces.background, surfaces.base);
  const rows = [
    screen,
    composite(surfaces.input, screen),
    composite(surfaces.chip, screen),
  ];
  return {
    screen,
    all: [screen, ...rows.slice(1), composite(surfaces["chip-subtle"], screen)],
    /**
     * A status chip washes its OWN hue behind its ink, which tints the backdrop
     * TOWARDS that ink — an ink measured only against the plain rows is measured
     * against the easiest case, so the wash is part of its floor.
     */
    washes: (hue) =>
      WASH_ALPHAS.flatMap((alpha) =>
        rows.map((row) => composite(withAlpha(hue, alpha), row)),
      ),
  };
}

/**
 * Step `from` toward `toward` (the palette's ink) in 2% mixes until it clears
 * `floor` on every surface. Moving toward ink always raises contrast — ink is
 * the darkest thing in a light palette and the brightest in a dark one — so the
 * ladder is monotone and its last rung is ink itself. A palette whose own ink
 * misses the floor is a build error, not a silently unreadable block.
 *
 * @returns {{ value: import("./color.mjs").Rgba, steps: number }}
 */
function nudge(from, toward, surfaces, floor, label) {
  for (let step = 0; step <= STEPS; step += 1) {
    const value = mix(from, toward, step * STEP);
    if (surfaces.every((s) => contrast(value, s) >= floor)) {
      return { value, steps: step };
    }
  }
  throw new Error(
    `${label}: cannot reach ${floor}:1 on every surface, even at the palette's own ink`,
  );
}

/** The label printed ON a filled surface: whichever candidate reads best on it. */
function labelOn(fill, p) {
  const candidates = [p.background, p.bright_foreground, "#000000", "#ffffff"];
  return candidates.reduce((best, c) =>
    contrast(c, fill) > contrast(best, fill) ? c : best,
  );
}

/**
 * The label printed ON the CTA. An import wears its own accent as `action`, and
 * that accent is a hue tuned for a terminal prompt rather than for a button, so
 * the label is measured rather than assumed: whichever candidate reads best, and
 * a build error when even the best one misses the body floor, because a CTA is
 * the one surface a user cannot avoid reading.
 */
function actionText(accent, p, notes) {
  const label = labelOn(accent, p);
  const ratio = contrast(label, accent);
  if (ratio < BODY_FLOOR) {
    throw new Error(
      `${p.id}: --ht-action-text reads ${ratio.toFixed(2)}:1 on the accent (${formatColor(accent)}), below ${BODY_FLOOR}:1`,
    );
  }
  if (label === "#000000" || label === "#ffffff") {
    notes.push(
      `${p.id}: action-text is ${label} (${ratio.toFixed(2)}:1 on accent ${formatColor(accent)}); no palette colour reads better`,
    );
  }
  return label;
}

/**
 * The starting point for `highlight-text`: the highlight hue itself, taken far
 * enough toward black (light) or white (dark) to read as an ink rather than a
 * fill, before the nudge ladder measures it.
 */
const highlightSeed = (p) =>
  p.mode === "light"
    ? mix(p.yellow, "#000000", 0.75)
    : mix(p.yellow, "#ffffff", 0.7);

/**
 * Every text, interactive and status role for one palette.
 *
 * @param {Record<string, string> & { id: string, mode: "light" | "dark" }} p
 * @param {Record<string, unknown>} surfaces the already-derived surface roles
 * @param {string[]} notes
 */
export function paletteText(p, surfaces, notes) {
  const dark = p.mode === "dark";
  const fg = p.foreground;
  const bg = p.background;
  const { screen, all, washes } = surfaceStack(surfaces);
  const highlight = withAlpha(p.yellow, dark ? 0.34 : 0.45);

  const step = (role, from, floor, extra = []) => {
    const { value, steps } = nudge(
      from,
      fg,
      [...all, ...extra],
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

  return {
    ink: fg,
    // `ink-muted` is secondary text, held to the 3:1 non-body floor.
    "ink-muted": step("ink-muted", p.muted, MUTED_FLOOR),
    "card-text": fg,
    "popover-text": fg,
    "chip-text": fg,
    "sidebar-text": fg,
    "sidebar-hover-text": fg,
    "hover-text": fg,
    "prose-text": dark ? p.bright_foreground : fg,
    // An import is a colour identity, so its CTA and its focus ring wear the
    // palette's own accent. Houston's authored sets keep an ink CTA by doctrine,
    // and they never reach this derivation: they ARE the base blocks.
    action: p.accent,
    "action-text": actionText(p.accent, p, notes),
    focus: p.accent,
    link: step("link", p.blue, BODY_FLOOR),
    // The user's own bubble inverts in light (ink fill, background text) and is a
    // faint ink wash in dark; the chip inside it is the bubble's TEXT colour at
    // Houston's alpha, so it stays legible against the fill either way.
    bubble: dark ? withAlpha(fg, 0.045) : fg,
    "bubble-text": dark ? p.bright_foreground : bg,
    "bubble-chip": dark ? withAlpha(fg, 0.1) : withAlpha(bg, 0.2),
    "bubble-chip-text": dark ? fg : bg,
    danger: p.red,
    "danger-text": labelOn(p.red, p),
    "danger-fill": dark ? withAlpha(p.red, 0.6) : p.red,
    "danger-ring": withAlpha(p.red, dark ? 0.4 : 0.2),
    "danger-ink": step("danger-ink", p.red, BODY_FLOOR, washes(p.red)),
    success: p.green,
    "success-text": labelOn(p.green, p),
    "success-ink": step("success-ink", p.green, BODY_FLOOR, washes(p.green)),
    warning: p.yellow,
    "warning-text": labelOn(p.yellow, p),
    "warning-ink": step("warning-ink", p.yellow, BODY_FLOOR, washes(p.yellow)),
    highlight,
    // The highlight ink also owes 4.5:1 on the wash it is printed on, which is
    // the only surface that token is ever used against.
    "highlight-text": step("highlight-text", highlightSeed(p), BODY_FLOOR, [
      composite(highlight, screen),
    ]),
  };
}
