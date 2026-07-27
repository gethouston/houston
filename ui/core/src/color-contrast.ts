/**
 * WCAG 2.x contrast maths — the single home for it in `ui/`.
 *
 * Why this exists: a colour picked to be an avatar FILL (white initials on a
 * saturated disc) is not automatically legible as TEXT on a pale or glassy
 * surface. The two jobs have different backdrops, so a palette that passes as a
 * fill can fail 4.5:1 as a name. Rather than assume, we measure — and we
 * measure from the design tokens, so a future palette edit re-derives itself
 * instead of silently shipping unreadable text.
 *
 * Pure: no React, no DOM, no `window.getComputedStyle`. Everything in here
 * takes CSS strings or plain `{ r, g, b, a }` objects, which makes it testable
 * under `node --experimental-strip-types`.
 *
 * Errors are thrown, never swallowed: an unparseable colour or a translucent
 * contrast input is a developer mistake at build/author time, not a user-facing
 * condition, and a silent fallback would hide exactly the regression this
 * module exists to catch.
 */

/** An sRGB colour with straight (non-premultiplied) alpha in 0..1. */
export interface ContrastColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#([0-9a-f]+)$/i;
const RGB_PATTERN =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

const CHANNEL_MAX = 255;
const SUPPORTED = "#rgb, #rrggbb, #rrggbbaa, rgb(r, g, b), rgba(r, g, b, a)";

/**
 * Parse the colour shapes the design tokens actually emit (`#rrggbb` and
 * `rgba(...)`) plus the shorthands authors reach for. Throws on anything else
 * — including named colours and `color-mix()` — because a half-understood
 * colour would quietly produce a wrong contrast number.
 */
export function parseColor(css: string): ContrastColor {
  const value = css.trim();

  const hex = HEX_PATTERN.exec(value);
  if (hex) return fromHexDigits(hex[1], css);

  const rgb = RGB_PATTERN.exec(value);
  if (rgb) {
    return {
      r: numeric(rgb[1], css),
      g: numeric(rgb[2], css),
      b: numeric(rgb[3], css),
      a: rgb[4] === undefined ? 1 : numeric(rgb[4], css),
    };
  }

  throw new Error(
    `parseColor: unsupported color "${css}". Supported forms: ${SUPPORTED}.`,
  );
}

function fromHexDigits(digits: string, css: string): ContrastColor {
  if (digits.length === 3) {
    const pair = (i: number) => Number.parseInt(digits[i] + digits[i], 16);
    return { r: pair(0), g: pair(1), b: pair(2), a: 1 };
  }
  if (digits.length === 6 || digits.length === 8) {
    const byte = (i: number) =>
      Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    const a = digits.length === 8 ? byte(3) / CHANNEL_MAX : 1;
    return { r: byte(0), g: byte(1), b: byte(2), a };
  }
  throw new Error(
    `parseColor: unsupported hex color "${css}". Supported forms: ${SUPPORTED}.`,
  );
}

function numeric(raw: string, css: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`parseColor: non-numeric channel "${raw}" in "${css}".`);
  }
  return n;
}

/** Serialize back to CSS — the inverse of `parseColor`, for round-tripping a
 *  composited surface into `contrastRatio`, which speaks CSS strings. */
export function formatColor(color: ContrastColor): string {
  const { r, g, b, a } = color;
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Alpha-composite `fg` over an opaque `bg` (source-over), returning the opaque
 * colour the eye actually sees. Houston's dark `background` token is glass
 * (`rgba(38, 38, 40, 0.55)`) over the `base` gutter, so measuring text against
 * the raw token would measure a colour that never reaches a screen.
 */
export function flattenColor(
  fg: ContrastColor,
  bg: ContrastColor,
): ContrastColor {
  if (bg.a !== 1) {
    throw new Error(
      "flattenColor: the backdrop must be opaque — composite it over its own backdrop first.",
    );
  }
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/**
 * WCAG 2.x relative luminance of an sRGB colour. Alpha is IGNORED — luminance
 * is only defined for an opaque colour, so composite with `flattenColor` first.
 */
export function relativeLuminance(color: ContrastColor): number {
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linearize(channel: number): number {
  const c = channel / CHANNEL_MAX;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.x contrast ratio between two CSS colours, in 1..21. Order does not
 * matter. BOTH colours must be opaque: composite translucent surfaces with
 * `flattenColor` before calling, otherwise the number is a fiction and this
 * throws rather than returning it.
 */
export function contrastRatio(a: string, b: string): number {
  const first = requireOpaque(parseColor(a), a);
  const second = requireOpaque(parseColor(b), b);
  const la = relativeLuminance(first);
  const lb = relativeLuminance(second);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function requireOpaque(color: ContrastColor, css: string): ContrastColor {
  if (color.a !== 1) {
    throw new Error(
      `contrastRatio: "${css}" is translucent — composite it with flattenColor first.`,
    );
  }
  return color;
}
