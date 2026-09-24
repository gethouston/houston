import { composite, contrast, formatColor, luminance } from "./color.mjs";
import { BODY_FLOOR, inkStepper, surfaceStack } from "./palette-ladder.mjs";

// Status is SEMANTICS, not surface. A terminal palette's red, green and yellow
// are the colours a shell prints error text in, not a product's tuned danger,
// success and warning, and a palette can have none at all: the `white` theme's
// three hues are #2a2a2a, #3a3a3a and #4a4a4a, which would leave a "Delete
// forever" pill indistinguishable from a normal button and a resting link as
// plain black text. So the whole status family and the link are inherited from
// the Houston set of the SAME MODE, exactly like the agent helmets and the
// file-type tints, and re-measured here on the palette's own surfaces: the fills
// stay Houston's, each label is re-picked on its fill in the palette's own
// vocabulary, and the roles worn AS TEXT climb the palette's ladder.

/** The alphas a status chip washes its own hue at (`bg-success/15`, `bg-danger/10`). */
const STATUS_WASH_ALPHAS = [0.15, 0.1];

/** The alpha the chat link chip washes the link colour at (`bg-link/10`). */
const LINK_WASH_ALPHAS = [0.1];

/** The alphas `--ht-highlight` wears: it is already translucent, so full strength. */
const HIGHLIGHT_WASH_ALPHAS = [1];

/**
 * A status label is a short, bold word on a pill, so it owes WCAG's large-text
 * floor rather than the body floor. Houston's own light warning fill carries its
 * white label at 2.1:1 by authored choice; an import may not, because it reaches
 * that fill through a rule rather than through a designer.
 */
const LABEL_FLOOR = 3;

/**
 * The label printed ON an inherited status fill. The fill is Houston's, so the
 * label keeps the SIDE Houston put it on: a destructive pill reads light-on-red
 * in every palette, never white on that red in one set and black on it in the
 * next. Within that side it speaks the palette's own vocabulary, taking the
 * first tone that clears the label floor and pure white or pure black only when
 * no palette tone does. A side that cannot clear the floor at all flips, because
 * an unreadable label is worse than an inconsistent one, and the build says so.
 */
function statusLabel(role, fill, houstonLabel, p, notes) {
  const lit = luminance(fill);
  const lightsUp = (tone) => luminance(tone) > lit;
  const lighter = lightsUp(houstonLabel);
  const own = [p.background, p.foreground, p.bright_foreground];
  const tones = [...own, "#ffffff", "#000000"];
  const sameSide = (tone) => lightsUp(tone) === lighter;
  const clears = (tone) => contrast(tone, fill) >= LABEL_FLOOR;
  const kept = tones.filter(sameSide).find(clears);
  const label = kept ?? tones.filter((tone) => !sameSide(tone)).find(clears);
  if (label === undefined) {
    throw new Error(
      `${p.id}: no tone reads ${LABEL_FLOOR}:1 as --ht-${role} on ${formatColor(fill)}`,
    );
  }
  const reasons = [];
  if (kept === undefined) {
    reasons.push(
      `no ${lighter ? "light" : "dark"} tone clears ${LABEL_FLOOR}:1, so the label changes side`,
    );
  }
  if (!own.includes(label)) {
    reasons.push(`no palette tone clears ${LABEL_FLOOR}:1`);
  }
  // The label keeps Houston's side, so it also inherits Houston's ratio on that
  // fill; worth a note only when the fill carries NO body-floor label at all,
  // which is a fill to re-tune rather than a label to re-pick.
  if (tones.every((tone) => contrast(tone, fill) < BODY_FLOOR)) {
    reasons.push(`no tone reaches the ${BODY_FLOOR}:1 body floor on this fill`);
  }
  if (reasons.length > 0) {
    notes.push(
      `${p.id}: ${role} is ${formatColor(label)} on ${formatColor(fill)} (${contrast(label, fill).toFixed(2)}:1); ${reasons.join("; ")}`,
    );
  }
  return label;
}

/**
 * The status family and the link for one palette: Houston's own hexes of the
 * same mode, re-measured against this palette's surfaces.
 *
 * @param {Record<string, string>} houston the Houston set of the same mode, by role
 * @param {Record<string, string> & { id: string, mode: "light" | "dark" }} p
 * @param {Record<string, unknown>} surfaces the already-derived surface roles
 * @param {string[]} notes
 */
export function paletteStatus(houston, p, surfaces, notes) {
  const { all, washes } = surfaceStack(surfaces);
  // The first row IS the screen, so a fill is measured as the user meets it:
  // painted on the surface its pill sits on, whatever alpha it carries.
  const [screen] = all;
  const step = inkStepper(p, all, notes);
  const inherit = (role) => {
    const value = houston[role];
    if (value === undefined) {
      throw new Error(
        `palette ${p.id}: the Houston ${p.mode} set does not define --ht-${role}`,
      );
    }
    return value;
  };
  const label = (role, fill) =>
    statusLabel(role, composite(fill, screen), inherit(role), p, notes);
  // A status chip washes its own hue behind its own text, and that hue is now
  // Houston's, so the ink is stepped against Houston's wash over this palette's
  // rows rather than against the plain rows alone.
  const statusInk = (role, hue) =>
    step(role, inherit(role), BODY_FLOOR, () =>
      washes(hue, STATUS_WASH_ALPHAS),
    );
  const danger = inherit("danger");
  const success = inherit("success");
  const warning = inherit("warning");
  const highlight = inherit("highlight");
  return {
    danger,
    "danger-text": label("danger-text", danger),
    "danger-fill": inherit("danger-fill"),
    "danger-ring": inherit("danger-ring"),
    "danger-ink": statusInk("danger-ink", danger),
    success,
    "success-text": label("success-text", success),
    "success-ink": statusInk("success-ink", success),
    warning,
    "warning-text": label("warning-text", warning),
    "warning-ink": statusInk("warning-ink", warning),
    highlight,
    "highlight-text": step(
      "highlight-text",
      inherit("highlight-text"),
      BODY_FLOOR,
      () => washes(highlight, HIGHLIGHT_WASH_ALPHAS),
    ),
    // The chat link chip prints the link colour on a 10% wash OF ITSELF
    // (`text-link bg-link/10`), so every rung re-composites the backdrop it is
    // being measured against.
    link: step("link", inherit("link"), BODY_FLOOR, (value) =>
      washes(value, LINK_WASH_ALPHAS),
    ),
  };
}
