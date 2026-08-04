import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

/**
 * Shared chrome for the two photographic certificate images: the palette, the
 * type system, the primitives and the issuer lockup.
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

/**
 * Family names as registered in raster.mjs.
 *
 * General Sans is Houston's typeface — the face `.lnav-brand` sets the wordmark
 * in on every page of gethouston.ai. `FALLBACK_FONT` draws nothing by choice;
 * it is only there to catch code points General Sans lacks (raster.mjs).
 */
export const BRAND_FONT = "General Sans";
export const FALLBACK_FONT = "Hanken Grotesk";

/**
 * The site's type system, transposed onto a 2000px canvas.
 *
 * Four roles, taken from the landing's CSS rather than invented here:
 *
 * - DISPLAY — `.hero-h1`: the heaviest thing on the page, set TIGHT
 *   (semibold-ish, -0.035em). The recipient's name is the certificate's hero,
 *   so it takes this. `WORDMARK` weight (500) is the wordmark's own
 *   (`.lnav-brand`), which is what the name is set in: the attendee's name
 *   wears the brand's weight.
 * - EYEBROW — `.s-eyebrow` / `.st-kicker`: uppercase, semibold, openly tracked
 *   (0.07-0.08em on the site; a hair wider here because these caps run at 4x
 *   the size and a certificate's labels are meant to read as engraving).
 * - BODY — `.hero-sub` / `.s-sub`: regular, no tracking, generous leading.
 * - CODE — `.cert-code`: the site sets it in mono at 0.05em; there is no mono
 *   in the bundle, so it is semibold caps opened up to read as a key.
 */
export const WEIGHT = { body: 400, wordmark: 500, display: 500, strong: 600 };
export const TRACK = {
  /** `.hero-h1` letter-spacing, as a fraction of the size. */
  display: -0.032,
  /** `.lnav-brand` letter-spacing. */
  wordmark: -0.02,
  /** Event titles — `.split-h`, one notch looser than the hero. */
  title: -0.018,
  eyebrow: 0.11,
  code: 0.08,
  /** Quiet metadata: the domain under the wordmark, the date, the card meta. */
  meta: 0.045,
};
/** `.hero-h1` line-height. Display type on the site is set tight. */
export const LEADING = { display: 1.06, title: 1.2, body: 1.42 };

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

/** A hairline, as wide as asked. The site's `--line` on a dark ground. */
export const rule = (width) =>
  h("div", {
    style: { display: "flex", width, height: 1, backgroundColor: HAIRLINE },
  });

/** An uppercase label in the site's eyebrow voice. See TRACK.eyebrow. */
export const eyebrow = (content, size, style) =>
  centred(content, {
    fontSize: size,
    fontWeight: WEIGHT.strong,
    letterSpacing: size * TRACK.eyebrow,
    ...style,
  });

/**
 * The issuer lockup: the helmet, the Houston wordmark to its right, and the
 * domain set directly under the wordmark.
 *
 * The wordmark is the SITE's wordmark, not a decorative respelling of it:
 * title case, General Sans 500, -0.02em — `.lnav-brand`, verbatim. It used to
 * be "HOUSTON" in wide-tracked caps, which is a wordmark Houston does not own.
 *
 * @param {{helmet: number, word: number, domain: number, centred?: boolean}} sizes
 */
export function lockup({ helmet, word, domain, centred = false }) {
  const track = word * TRACK.wordmark;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
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
          marginLeft: Math.round(helmet * 0.22),
        },
      },
      text("Houston", {
        fontSize: word,
        fontWeight: WEIGHT.wordmark,
        letterSpacing: track,
        color: INK,
      }),
      text("gethouston.ai", {
        marginTop: Math.round(word * 0.14),
        fontSize: domain,
        fontWeight: WEIGHT.body,
        letterSpacing: domain * TRACK.meta,
        color: INK_SUBTLE,
      }),
    ),
  );
}
