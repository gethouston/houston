/**
 * Geometry + comet-streak config for {@link OrbitLoader}. Split into its own
 * module so the component stays well under the 200-line limit and the ellipse
 * math lives in one obvious place. All coordinates are in the loader's square
 * viewBox ({@link ORBIT_VIEWBOX}px).
 */

export const ORBIT_VIEWBOX = 240;
/** Centre of the square viewBox (both axes). */
export const ORBIT_CENTER = ORBIT_VIEWBOX / 2; // 120
export const ORBIT_RX = 96;
export const ORBIT_RY = 44;
/** Tilt (deg) of the whole orbit plane, so the ellipse reads as an orbit seen
 *  at an angle rather than a flat ring. */
export const ORBIT_TILT = -18;
/** One full lap — unhurried and premium, never a race. */
export const ORBIT_PERIOD = "6s";

/** The elliptical orbit as a closed path, referenced by every rider's <mpath>
 *  so they all travel the exact same curve. Two clockwise half-arcs. Kept in
 *  the raw (untilted) frame; the tilt comes from the group transform, so the
 *  motion coordinates stay simple and the riders bank inside the tilted plane. */
export const ORBIT_PATH = `M ${ORBIT_CENTER - ORBIT_RX} ${ORBIT_CENTER} A ${ORBIT_RX} ${ORBIT_RY} 0 1 1 ${ORBIT_CENTER + ORBIT_RX} ${ORBIT_CENTER} A ${ORBIT_RX} ${ORBIT_RY} 0 1 1 ${ORBIT_CENTER - ORBIT_RX} ${ORBIT_CENTER}`;

/** Rocket pointing along +x (the axis animateMotion rotate="auto" aligns to the
 *  travel direction): an ogive nose cone, a cylindrical body, swept tail fins,
 *  and a tapered engine base. A single closed compound path, centred on the
 *  origin so it rides the path point, sized to a ~17px span so its silhouette
 *  still reads as a rocket at small scale. */
export const SHIP_PATH =
  "M 10 0 Q 6 -1.9 1.5 -2.2 L -2.5 -2.2 L -5 -4.8 L -5 -2.2 L -6 -2.2 L -6.5 -1.3 L -6.5 1.3 L -6 2.2 L -5 2.2 L -5 4.8 L -2.5 2.2 L 1.5 2.2 Q 6 1.9 10 0 Z";

const WHITE = "var(--ht-space-foreground)";
const STAR = "var(--ht-space-star)";
/** White streak: `head` is the percent of pure-white foreground mixed over the
 *  cool-white star. 100 = pure white (head), 0 = cool white (tail tip). The
 *  streak fades mainly via opacity; this adds only a subtle tonal shift for
 *  depth, no hue change. */
const mix = (head: number) => `color-mix(in srgb, ${WHITE} ${head}%, ${STAR})`;

/**
 * One soft blurred capsule in the comet streak. Each rides {@link ORBIT_PATH}
 * on the same period, offset by a POSITIVE `begin` (a delayed start) so it
 * lags behind the head, shrinking and fading into the tail. A negative begin
 * would do the opposite: SMIL treats it as "started earlier," so the element
 * has already travelled further along the path than the head, putting it
 * ahead of the ship instead of trailing it. Elongated along travel (`rx` >
 * `ry`, banked by `rotate="auto"`) and blurred, so the tightly-spaced copies
 * overlap into ONE continuous glowing streak rather than a line of discrete
 * blobs.
 */
export interface TrailCapsule {
  begin: string;
  /** Half-length along travel (px). */
  rx: number;
  /** Half-width across travel (px). */
  ry: number;
  opacity: number;
  fill: string;
}

/**
 * Comet streak, tail-first (faintest drawn first) so the bright head paints on
 * top. All white: opacity ramps up toward the head while the tone shifts subtly
 * from cool-white star (tail) to pure-white foreground (head) for a touch of
 * depth. Close `begin` spacing keeps the blurred capsules overlapping.
 */
export const TRAIL: TrailCapsule[] = [
  { begin: "1.04s", rx: 4.4, ry: 1.9, opacity: 0.22, fill: mix(0) },
  { begin: "0.96s", rx: 4.7, ry: 2.0, opacity: 0.28, fill: mix(0) },
  { begin: "0.88s", rx: 5.0, ry: 2.1, opacity: 0.34, fill: mix(20) },
  { begin: "0.8s", rx: 5.4, ry: 2.2, opacity: 0.4, fill: mix(38) },
  { begin: "0.72s", rx: 5.8, ry: 2.3, opacity: 0.45, fill: mix(54) },
  { begin: "0.64s", rx: 6.2, ry: 2.4, opacity: 0.5, fill: mix(66) },
  { begin: "0.56s", rx: 6.6, ry: 2.5, opacity: 0.55, fill: mix(76) },
  { begin: "0.48s", rx: 7.0, ry: 2.7, opacity: 0.62, fill: mix(84) },
  { begin: "0.4s", rx: 7.4, ry: 2.8, opacity: 0.7, fill: mix(90) },
  { begin: "0.32s", rx: 7.8, ry: 2.9, opacity: 0.78, fill: mix(95) },
  { begin: "0.24s", rx: 8.2, ry: 3.0, opacity: 0.86, fill: mix(100) },
  { begin: "0.16s", rx: 8.6, ry: 3.2, opacity: 0.94, fill: mix(100) },
];

/** Reduced-motion resting pose: a single ship parked on the ring's top vertex,
 *  nose along travel (+x), rendered with no SMIL at all. */
export const STATIC_SHIP = { x: ORBIT_CENTER, y: ORBIT_CENTER - ORBIT_RY };
