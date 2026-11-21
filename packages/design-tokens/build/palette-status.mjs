import { composite, contrast, formatColor, luminance } from "./color.mjs";
import { BODY_FLOOR, inkStepper, surfaceStack } from "./palette-ladder.mjs";

const STATUS_WASH_ALPHAS = [0.15, 0.1];

const LINK_WASH_ALPHAS = [0.1];

const HIGHLIGHT_WASH_ALPHAS = [1];

const LABEL_FLOOR = 3;

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
    link: step("link", inherit("link"), BODY_FLOOR, (value) =>
      washes(value, LINK_WASH_ALPHAS),
    ),
  };
}
