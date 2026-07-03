// Colour parsing shared by the native serializers and the zero-diff test.
// Normalizes any CSS colour string the token source uses (#rrggbb, rgb(),
// rgba(), transparent) to float components in [0, 1]. This is what makes the
// zero-diff proof robust: two strings that render the SAME pixels (e.g. the
// `0.10` vs `0.1` alpha wart in the legacy CSS) compare equal.

/**
 * @param {string} raw
 * @returns {{ r: number, g: number, b: number, a: number }}
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

/** Round to 6 decimals, dropping a trailing `.0` for whole numbers. */
export function num(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
