/**
 * Star-field generation for {@link Starfield}. Kept out of the component so the
 * draw loop stays lean and the file-size budget holds; the offscreen sprites +
 * static layer live in {@link ./starfield-sprites}. All colour comes from the
 * caller's {@link SpacePalette} (read once from the `--ht-space-*` tokens) — this
 * module never hardcodes a colour literal.
 *
 * The realism model, in one place:
 *   - Magnitude follows `pow(rand, 2.5)`, so ~70% of stars are faint (low peak
 *     alpha, sub-pixel radius) and only a handful are bright. Radius correlates
 *     with brightness.
 *   - Colour temperature is sampled ~65% cool-white / ~25% neutral / ~10% warm,
 *     and each star's `fillStyle` is precomputed so the loop allocates no
 *     strings (alpha rides on `globalAlpha`).
 *   - A diagonal Milky-Way band biases ~57% of stars into a ~35%-of-diagonal
 *     strip (≈2.5× the ambient density), matched by a faint painted haze band in
 *     the static layer.
 *   - Only faint stars twinkle; the brightest ~8% carry a soft bloom halo drawn
 *     from a single precomputed sprite.
 */

/** An RGB triple in 0–255, parsed from a `--ht-space-*` hex token. */
export type Rgb = readonly [number, number, number];

/** The theme-invariant space colours the model needs, parsed to RGB. */
export interface SpacePalette {
  /** `--ht-space-star` — cool-white, the dominant temperature. */
  star: Rgb;
  /** `--ht-space-star-warm` — the warm minority. */
  starWarm: Rgb;
  /** `--ht-space-haze` — the Milky-Way haze band. */
  haze: Rgb;
  /** `--ht-space-canvas` — the base, used for the corner vignette. */
  canvas: Rgb;
}

/** One precomputed star. No field is (re)allocated during the draw loop. */
export interface Star {
  x: number;
  y: number;
  /** Core radius in CSS px (0.3–1.5, brightness-correlated). */
  r: number;
  /** Drift velocity in CSS px/s (near-still, ≤0.8 magnitude). */
  vx: number;
  vy: number;
  /** Peak alpha at the top of the twinkle (or steady, if not twinkling). */
  peak: number;
  /** Precomputed `rgb(r, g, b)` string; alpha is applied via `globalAlpha`. */
  fillStyle: string;
  /** Faint stars twinkle; bright ones stay steady. */
  twinkle: boolean;
  /** Twinkle amplitude in absolute alpha (±15% of peak). */
  amp: number;
  /** Angular speed rad/s for a 5–12s period. */
  speed: number;
  /** Independent sine phase. */
  phase: number;
  /** The brightest ~8% carry a bloom halo. */
  bloom: boolean;
  /** Halo draw radius in CSS px (3–4× core radius). */
  bloomR: number;
  /** Temperature bucket (0 cool / 1 neutral / 2 warm) — picks the tinted halo. */
  bloomTemp: number;
}

/** Parse a `#rrggbb` token value to an {@link Rgb} triple. */
export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace("#", "");
  const n = Number.parseInt(
    h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.slice(0, 6),
    16,
  );
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
/** `rgba(...)` string helper; also used by {@link ./starfield-sprites}. */
export const rgba = (c: Rgb, a: number) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const mix = (a: Rgb, b: Rgb): Rgb => [
  Math.round((a[0] + b[0]) / 2),
  Math.round((a[1] + b[1]) / 2),
  Math.round((a[2] + b[2]) / 2),
];

/** Temperature bucket → star colour + bloom-halo tint index (0/1/2). */
function pickTemp(
  t: number,
  palette: SpacePalette,
  neutral: Rgb,
): { color: Rgb; bloomTemp: number } {
  if (t < 0.65) return { color: palette.star, bloomTemp: 0 };
  if (t < 0.9) return { color: neutral, bloomTemp: 1 };
  return { color: palette.starWarm, bloomTemp: 2 };
}

/**
 * Generate the star field for a `w×h` (CSS px) canvas. ~57% of the near stars are
 * biased into the diagonal Milky-Way band (lower-left → upper-right) so the band
 * reads at ~2.5× the ambient density; the rest are uniform. A far depth layer
 * (~60% more stars, sub-pixel, alpha ≤ 0.15, half drift speed) is scattered
 * uniformly on top for parallax depth.
 */
export function makeStars(w: number, h: number, palette: SpacePalette): Star[] {
  const count = Math.round((w * h) / 11000);
  const neutral = mix(palette.star, palette.starWarm);
  // Band geometry: unit direction (lower-left → upper-right) + perpendicular.
  const diag = Math.hypot(w, h);
  const halfWidth = diag * 0.175; // ~35% of the diagonal, total width
  const dirX = w / diag;
  const dirY = -h / diag;
  const cx = w / 2;
  const cy = h / 2;

  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    if (Math.random() < 0.57) {
      // Along the band axis, with a centre-weighted perpendicular offset.
      const along = (Math.random() - 0.5) * diag * 1.2;
      const across =
        ((Math.random() + Math.random() - 1) / 1) * halfWidth * 0.9;
      x = cx + dirX * along - dirY * across;
      y = cy + dirY * along + dirX * across;
      if (x < 0 || x > w || y < 0 || y > h) {
        x = Math.random() * w;
        y = Math.random() * h;
      }
    } else {
      x = Math.random() * w;
      y = Math.random() * h;
    }

    // Magnitude: pow(rand, 2.5) — heavily skewed toward faint.
    const b = Math.random() ** 2.5;
    const peak = 0.12 + b * 0.88; // 0.12 (faint) → 1.0 (brightest)
    const r = 0.3 + b * 1.2; // 0.3 → 1.5 px, brightness-correlated
    const twinkle = peak < 0.4; // only faint stars twinkle
    const bloom = b > 0.81; // brightest ~8%

    // Temperature: 65% cool / 25% neutral / 10% warm.
    const { color, bloomTemp } = pickTemp(Math.random(), palette, neutral);

    stars.push({
      x,
      y,
      r,
      vx: -(0.05 + Math.random() * 0.35), // drift left, ≤0.4 px/s
      vy: 0.05 + Math.random() * 0.3, // drift down, ≤0.35 px/s
      peak,
      fillStyle: rgb(color),
      twinkle,
      amp: twinkle ? peak * 0.15 : 0, // ±15% of alpha
      speed: (Math.PI * 2) / (5 + Math.random() * 7), // 5–12s period
      phase: Math.random() * Math.PI * 2,
      bloom,
      bloomR: r * (3 + Math.random()), // 3–4× core radius
      bloomTemp,
    });
  }

  // Far depth layer: ~60% more stars, sub-pixel, very faint, half drift speed.
  const farCount = Math.round(count * 0.6);
  for (let i = 0; i < farCount; i++) {
    const { color, bloomTemp } = pickTemp(Math.random(), palette, neutral);
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.2 + Math.random() * 0.2, // 0.2–0.4 px
      vx: -(0.025 + Math.random() * 0.175), // half of near, ≤0.2 px/s
      vy: 0.025 + Math.random() * 0.15, // half of near, ≤0.175 px/s
      peak: 0.05 + Math.random() * 0.1, // alpha ≤ 0.15
      fillStyle: rgb(color),
      twinkle: false,
      amp: 0,
      speed: 0,
      phase: 0,
      bloom: false,
      bloomR: 0,
      bloomTemp,
    });
  }
  return stars;
}
