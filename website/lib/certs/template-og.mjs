import {
  BODY_FONT,
  backdrop,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  lockup,
  NAVY,
  navy,
  text,
} from "./chrome.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";

/**
 * The social card: 1200x630 on the same photograph as the certificate.
 *
 * Deliberately NOT a shrunken certificate — at feed size a document reads as
 * grey noise. The card keeps the mark, the claim, the name and the event, all
 * left-aligned in the dark half of the sky, and hands the bottom third back to
 * the photograph: at this size the sunrise IS the design.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * Two scrims, because the card's type is left-aligned rather than centred.
 *
 * The vertical one holds the sky down for the header and the claim and releases
 * before the horizon. The horizontal one deepens only the left, which is what
 * lets the name sit on a photograph without a panel behind it — and it leaves
 * the sunrise and the far ship untouched on the right.
 */
const SCRIM = [
  `linear-gradient(180deg, ${navy(0.7)} 0%, ${navy(0.58)} 38%, ${navy(0.26)} 62%, ${navy(0)} 78%)`,
  `linear-gradient(90deg, ${navy(0.52)} 0%, ${navy(0.28)} 44%, ${navy(0)} 70%)`,
];

/** One notch smaller than the printed certificate's ladder. */
function nameSize(name) {
  const len = [...name].length;
  if (len <= 18) return 96;
  if (len <= 26) return 78;
  if (len <= 36) return 64;
  return 54;
}

export function ogCardElement(item) {
  const copy = certCopy(item.lang);
  const size = nameSize(item.displayName);
  // Joined, not concatenated: an event whose date the gateway could not give us
  // must show the code alone, never a dangling separator.
  const meta = [item.eventDateDisplay, item.code].filter(Boolean).join("  ·  ");

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor: NAVY,
        fontFamily: BODY_FONT,
      },
    },
    ...backdrop(OG_WIDTH, OG_HEIGHT, { focusY: 0.5, scrim: SCRIM }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "54px 68px",
        },
      },
      // ── Issuer left, credential metadata right ───────────────────────────
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          },
        },
        lockup({ helmet: 46, word: 22, domain: 13 }),
        text(meta, {
          fontSize: 19,
          fontWeight: 400,
          letterSpacing: 1.4,
          color: INK_SUBTLE,
        }),
      ),
      // ── The claim ────────────────────────────────────────────────────────
      // Bottom-anchored inside the sky: a name long enough to wrap grows UP
      // into the dark, never down onto the sunrise.
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "flex-end",
            alignItems: "flex-start",
            width: 880,
            paddingBottom: 118,
          },
        },
        text(copy.certificateOf, {
          // Right pad is 9px short so the pill reads optically centred: satori
          // adds the letter spacing after the final glyph, and the closing "N"
          // carries a right sidebearing on top of it.
          padding: "9px 13px 9px 22px",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 999,
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: 3.6,
          color: INK_MUTED,
        }),
        text(item.displayName, {
          marginTop: 26,
          width: "100%",
          fontSize: size,
          fontWeight: 300,
          letterSpacing: size * -0.03,
          lineHeight: 1.14,
          color: INK,
        }),
        text(item.eventTitle, {
          marginTop: 16,
          width: "100%",
          fontSize: 30,
          fontWeight: 600,
          lineHeight: 1.3,
          color: INK,
        }),
      ),
    ),
  );
}

export default ogCardElement;
