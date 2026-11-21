import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

export const BRAND_FONT = "General Sans";
export const FALLBACK_FONT = "Hanken Grotesk";

export const WEIGHT = { body: 400, wordmark: 500, display: 500, strong: 600 };
export const TRACK = {
  display: -0.032,
  wordmark: -0.02,
  title: -0.018,
  eyebrow: 0.11,
  code: 0.08,
  meta: 0.045,
};
export const LEADING = { display: 1.06, title: 1.2, body: 1.42 };

export const INK = "#faf9f5";
export const INK_MUTED = "rgba(250, 249, 245, 0.82)";
export const INK_SUBTLE = "rgba(250, 249, 245, 0.66)";
export const HAIRLINE = "rgba(250, 249, 245, 0.28)";
export const NAVY = "#040c1e";
export const navy = (alpha) => `rgba(4, 12, 30, ${alpha})`;

export const text = (content, style) =>
  h("div", { style: { display: "flex", ...style } }, content);

export const centred = (content, style) => {
  const track = style.width ? 0 : (style.letterSpacing ?? 0);
  return text(content, track ? { marginLeft: track, ...style } : style);
};

export const rule = (width) =>
  h("div", {
    style: { display: "flex", width, height: 1, backgroundColor: HAIRLINE },
  });

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
