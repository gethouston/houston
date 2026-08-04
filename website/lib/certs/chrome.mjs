import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

/**
 * Shared chrome for the two photographic certificate images: the palette, the
 * font families, the two type primitives and the issuer lockup.
 *
 * Both images are the same photograph with one translucent glass panel over it
 * (panel.mjs) carrying every word. Anything that has to be identical between
 * the printable certificate and the social card lives here; the photograph and
 * its crop maths live in backdrop.mjs.
 *
 * satori implements a SUBSET of flexbox and has no block layout, so every
 * container declares `display:"flex"` with an explicit `flexDirection`, and
 * spacing is explicit margins.
 */

/** Family names as registered in raster.mjs. */
export const BODY_FONT = "Hanken Grotesk";

/**
 * Warm white on deep navy. The type never uses pure #fff: the photograph is a
 * cool blue, and Houston's warm white keeps the brand's ink on top of it.
 */
export const INK = "#faf9f5";
export const INK_MUTED = "rgba(250, 249, 245, 0.82)";
export const INK_SUBTLE = "rgba(250, 249, 245, 0.66)";
export const HAIRLINE = "rgba(250, 249, 245, 0.28)";
/** The photograph's own darkest sky — the panel tint and the canvas fallback. */
export const NAVY = "#040c1e";
/** That same navy at an alpha, for panel and scrim stops. */
export const navy = (alpha) => `rgba(4, 12, 30, ${alpha})`;

/** A line of type. */
export const text = (content, style) =>
  h("div", { style: { display: "flex", ...style } }, content);

/**
 * A line of type that a parent centres.
 *
 * satori adds the tracking after the LAST glyph too, so a centred, tracked line
 * lands letterSpacing/2 to the left of the true axis. Shrink-to-fit lines get a
 * compensating left margin — flex centring splits it evenly, so one full step of
 * margin moves the ink back by half. Full-width lines centre their own text and
 * need no correction.
 */
export const centred = (content, style) => {
  const track = style.width ? 0 : (style.letterSpacing ?? 0);
  return text(content, track ? { marginLeft: track, ...style } : style);
};

/**
 * The issuer lockup: the helmet, the HOUSTON wordmark to its right, and the
 * domain set directly under the wordmark.
 *
 * @param {{helmet: number, word: number, domain: number, centred?: boolean}} sizes
 */
export function lockup({ helmet, word, domain, centred = false }) {
  const track = word * 0.22;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        // Same trailing-tracking correction as `text`, for the lockup as a whole.
        ...(centred ? { marginLeft: track } : {}),
      },
    },
    h("img", {
      src: helmetDataUrl(INK),
      width: Math.round(helmet * HELMET_RATIO),
      height: helmet,
      style: { display: "flex" },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          marginLeft: Math.round(helmet * 0.28),
        },
      },
      text("HOUSTON", {
        fontSize: word,
        fontWeight: 600,
        letterSpacing: track,
        color: INK,
      }),
      text("gethouston.ai", {
        marginTop: Math.round(word * 0.22),
        fontSize: domain,
        fontWeight: 400,
        letterSpacing: domain * 0.06,
        color: INK_SUBTLE,
      }),
    ),
  );
}
