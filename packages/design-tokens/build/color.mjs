// Colour parsing and maths shared by the native serializers, the palette
// derivation and the zero-diff test. Normalizes any CSS colour string the token
// source uses (#rrggbb, rgb(), rgba(), transparent) to float components in
// [0, 1]. This is what makes the zero-diff proof robust: two strings that render
// the SAME pixels (e.g. the `0.10` vs `0.1` alpha wart in the legacy CSS)
// compare equal.

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */

/**
 * @param {string} raw
 * @returns {Rgba}
 */
export function parseColor(raw) {
  const value = raw.trim();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = value.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hex) {
    const int = Number.parseInt(hex[1], 16);
    return {
      r: ((int >> 16) & 0xff) / 255,
      g: ((int >> 8) & 0xff) / 255,
      b: (int & 0xff) / 255,
      a: hex[2] === undefined ? 1 : Number.parseInt(hex[2], 16) / 255,
    };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      throw new Error(`Unparseable colour: ${raw}`);
    }
    return {
      r: parts[0] / 255,
      g: parts[1] / 255,
      b: parts[2] / 255,
      a: parts.length >= 4 ? parts[3] : 1,
    };
  }

  throw new Error(`Unparseable colour: ${raw}`);
}

/** Accept either an already-parsed colour or any CSS string the tokens use. */
const rgba = (c) => (typeof c === "string" ? parseColor(c) : c);

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const byte = (n) => Math.round(clamp01(n) * 255);

/**
 * Serialize back to the CSS forms the token source already uses: `#rrggbb`
 * when fully opaque, `transparent` at zero alpha, `rgba()` otherwise. Alpha is
 * trimmed to at most four decimals so a composite never emits float noise.
 *
 * @param {Rgba | string} color
 * @returns {string}
 */
export function formatColor(color) {
  const { r, g, b, a } = rgba(color);
  if (a <= 0) return "transparent";
  if (a >= 1) {
    const hex = ((byte(r) << 16) | (byte(g) << 8) | byte(b))
      .toString(16)
      .padStart(6, "0");
    return `#${hex}`;
  }
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${Number(a.toFixed(4))})`;
}

/**
 * Linear interpolation in sRGB, matching CSS `color-mix(in srgb, a, b t%)`.
 * `t` is the share of `b`, clamped so a 50-step nudge ladder cannot overshoot.
 *
 * @param {Rgba | string} a
 * @param {Rgba | string} b
 * @param {number} t
 * @returns {Rgba}
 */
export function mix(a, b, t) {
  const x = rgba(a);
  const y = rgba(b);
  const k = clamp01(t);
  const lerp = (p, q) => p + (q - p) * k;
  return {
    r: lerp(x.r, y.r),
    g: lerp(x.g, y.g),
    b: lerp(x.b, y.b),
    a: lerp(x.a, y.a),
  };
}

/** The same colour at a new alpha, scaled by whatever alpha it already carries. */
export function withAlpha(color, a) {
  const c = rgba(color);
  return { ...c, a: clamp01(c.a * a) };
}

/**
 * Source-over compositing in sRGB, matching how a browser paints `fg` on `bg`.
 * This is what turns a translucent surface token into the opaque colour a
 * contrast ratio can actually be measured against.
 *
 * @param {Rgba | string} fg
 * @param {Rgba | string} bg
 * @returns {Rgba}
 */
export function composite(fg, bg) {
  const f = rgba(fg);
  const b = rgba(bg);
  const a = f.a + b.a * (1 - f.a);
  const channel = (fc, bc) => (fc * f.a + bc * b.a * (1 - f.a)) / (a || 1);
  return {
    r: channel(f.r, b.r),
    g: channel(f.g, b.g),
    b: channel(f.b, b.b),
    a,
  };
}

/**
 * Hue in degrees, or `null` for a gray. Channels that differ by less than one
 * eight-bit step are no hue at all, and that null is the whole difference
 * between "the same family as Houston's red" and "a palette that has no red":
 * the `white` theme's red, green and yellow are #2a2a2a, #3a3a3a and #4a4a4a.
 *
 * @param {Rgba | string} color
 * @returns {number | null}
 */
export function hue(color) {
  const { r, g, b } = rgba(color);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma < 1 / 255) return null;
  const sector =
    max === r
      ? (g - b) / chroma
      : max === g
        ? 2 + (b - r) / chroma
        : 4 + (r - g) / chroma;
  return (((sector * 60) % 360) + 360) % 360;
}

/**
 * The shorter way round the colour wheel between two hues, in degrees, and
 * `Infinity` when either colour is a gray: a gray is not a hue that happens to
 * sit far away, it is the absence of one, so a role that lost its hue can never
 * pass for a role that was merely nudged.
 *
 * @param {Rgba | string} a
 * @param {Rgba | string} b
 * @returns {number}
 */
export function hueDistance(a, b) {
  const ha = hue(a);
  const hb = hue(b);
  if (ha === null || hb === null) return Number.POSITIVE_INFINITY;
  const diff = Math.abs(ha - hb) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** WCAG 2.x relative luminance. The colour must already be opaque to mean anything. */
export function luminance(color) {
  const { r, g, b } = rgba(color);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
