import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

/**
 * The social card: 1200x630 on Houston's black band.
 *
 * Deliberately NOT a shrunken certificate — at feed size a document reads as
 * grey noise, so the card keeps only the mark, the claim, the name and the
 * event, on ink. Same satori constraints as template-cert.mjs (flex only,
 * explicit flexDirection everywhere).
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const FONT = "Hanken Grotesk";
const ON_INK = "#faf9f5";
const ON_INK_MUTED = "rgba(250, 249, 245, 0.74)";
const ON_INK_LINE = "rgba(250, 249, 245, 0.25)";

/** One notch smaller than the printed certificate's ladder. */
function nameSize(name) {
  const len = [...name].length;
  if (len <= 18) return 96;
  if (len <= 26) return 78;
  if (len <= 36) return 64;
  return 52;
}

const text = (content, style) =>
  h("div", { style: { display: "flex", ...style } }, content);

export function ogCardElement(item) {
  const copy = certCopy(item.lang);
  const size = nameSize(item.displayName);
  const helmetHeight = 34;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        padding: 72,
        backgroundColor: "#0a0a0a",
        fontFamily: FONT,
      },
    },
    // ── Wordmark ───────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: { display: "flex", flexDirection: "row", alignItems: "center" },
      },
      h("img", {
        src: helmetDataUrl(ON_INK),
        width: Math.round(helmetHeight * HELMET_RATIO),
        height: helmetHeight,
        style: { display: "flex" },
      }),
      text("HOUSTON", {
        marginLeft: 16,
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 5.2,
        color: ON_INK,
      }),
    ),
    // ── The claim ──────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          alignItems: "flex-start",
          width: "100%",
        },
      },
      text(copy.certificateOf, {
        // Right pad is 9px short so the pill reads optically centred: satori
        // adds the letter spacing after the final glyph, and the closing "N"
        // carries a right sidebearing on top of it. Measured equal (24px of
        // clear space each side) for both the en and the es string.
        padding: "9px 13px 9px 22px",
        border: `1px solid ${ON_INK_LINE}`,
        borderRadius: 999,
        fontSize: 18,
        fontWeight: 400,
        letterSpacing: 3.6,
        color: ON_INK_MUTED,
      }),
      text(item.displayName, {
        marginTop: 30,
        width: "100%",
        fontSize: size,
        fontWeight: 300,
        letterSpacing: size * -0.03,
        lineHeight: 1.15,
        color: ON_INK,
      }),
      text(item.eventTitle, {
        marginTop: 18,
        width: "100%",
        fontSize: 30,
        fontWeight: 600,
        lineHeight: 1.3,
        color: ON_INK,
      }),
    ),
    // ── Date · code ────────────────────────────────────────────────────────
    // Joined, not concatenated: an event whose date the gateway could not give
    // us must show the code alone, never a dangling separator.
    text([item.eventDateDisplay, item.code].filter(Boolean).join("  ·  "), {
      fontSize: 22,
      fontWeight: 400,
      color: ON_INK_MUTED,
    }),
  );
}

export default ogCardElement;
