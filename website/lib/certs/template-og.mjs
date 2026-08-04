import { backdrop } from "./backdrop.mjs";
import {
  BODY_FONT,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  lockup,
  navy,
  text,
} from "./chrome.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { canvas, panel, tint } from "./panel.mjs";

/**
 * The social card: 1200x630 on the same photograph and the same glass panel as
 * the certificate.
 *
 * Deliberately NOT a shrunken certificate — at feed size a document reads as
 * grey noise. The card keeps the panel language for family recognition, but
 * everything inside it stays left-aligned and set at feed size: the mark, the
 * claim, the name and the event, with the sunrise coming up through the lower
 * half of the glass behind them. The inset is tighter than the certificate's,
 * proportionally, because at thumbnail size a wide frame eats the type.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Photograph left visible on all four sides of the panel. */
const INSET = 40;

/**
 * Same shape of ramp as the certificate's, one notch lighter throughout: the
 * card is read at thumbnail size, where a heavy tint is the difference between
 * a photograph and a grey rectangle in a feed.
 */
const PANEL = tint([
  [0.52, 0],
  [0.46, 36],
  [0.42, 62],
  [0.5, 82],
  [0.62, 100],
]);

/** A vignette, nothing more — the panel carries the contrast. */
const VIGNETTE = `linear-gradient(180deg, ${navy(0.1)} 0%, ${navy(0.01)} 28%, ${navy(0)} 62%, ${navy(0.12)} 100%)`;

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
    { style: canvas(OG_WIDTH, OG_HEIGHT, BODY_FONT) },
    ...backdrop(OG_WIDTH, OG_HEIGHT, { focusY: 0.5, scrim: VIGNETTE }),
    panel(
      {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        inset: INSET,
        radius: 22,
        padding: "38px 48px 46px 48px",
        background: PANEL,
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
        lockup({ helmet: 44, word: 21, domain: 12 }),
        text(meta, {
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: 1.4,
          color: INK_SUBTLE,
        }),
      ),
      // ── The claim ────────────────────────────────────────────────────────
      // Bottom-anchored on the glass: a name long enough to wrap grows UP into
      // the dark half of the panel, never down onto the sunrise.
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "flex-end",
            alignItems: "flex-start",
            width: "100%",
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
          marginTop: 14,
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
