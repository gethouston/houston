import { backdrop } from "./backdrop.mjs";
import {
  BRAND_FONT,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  LEADING,
  lockup,
  navy,
  TRACK,
  text,
  WEIGHT,
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
  [0.88, 0],
  [0.85, 36],
  [0.82, 62],
  [0.87, 82],
  [0.92, 100],
]);

/** A vignette, nothing more — the panel carries the contrast. */
const VIGNETTE = `linear-gradient(180deg, ${navy(0.1)} 0%, ${navy(0.01)} 28%, ${navy(0)} 62%, ${navy(0.12)} 100%)`;

/**
 * The certificate's ladder at feed scale — the same rungs, ~0.58x.
 *
 * Cut for General Sans at the wordmark's weight, exactly like the printed
 * ladder (citation.mjs), so the two images step at the same name lengths and a
 * cohort's cards look like one set.
 */
function nameSize(name) {
  const len = [...name].length;
  if (len <= 12) return 100;
  if (len <= 20) return 88;
  if (len <= 28) return 70;
  if (len <= 34) return 60;
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
    { style: canvas(OG_WIDTH, OG_HEIGHT, BRAND_FONT) },
    ...backdrop(OG_WIDTH, OG_HEIGHT, { focusY: 0.5, scrim: VIGNETTE }),
    panel(
      {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        inset: INSET,
        radius: 22,
        padding: "44px 54px 48px 54px",
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
        lockup({ helmet: 60, word: 29, domain: 13 }),
        text(meta, {
          fontSize: 18,
          fontWeight: WEIGHT.body,
          letterSpacing: 18 * TRACK.meta,
          color: INK_SUBTLE,
        }),
      ),
      // ── The claim ────────────────────────────────────────────────────────
      // CENTRED in the glass left under the header, not pinned to the floor.
      // Bottom-anchored, it pooled every spare pixel — over 200 of them — into
      // one band across the card's middle, and with the panel tint this opaque
      // there is no photograph coming through it to justify the emptiness. A
      // name long enough to wrap now grows both ways into air it already has.
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
          // Right pad is 6px short so the pill reads optically centred: satori
          // adds the letter spacing after the final glyph, and the closing "N"
          // carries a right sidebearing on top of it.
          padding: "9px 16px 9px 22px",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 999,
          fontSize: 17,
          fontWeight: WEIGHT.strong,
          letterSpacing: 17 * TRACK.eyebrow,
          color: INK_MUTED,
        }),
        text(item.displayName, {
          marginTop: 24,
          width: "100%",
          fontSize: size,
          fontWeight: WEIGHT.display,
          letterSpacing: size * TRACK.display,
          lineHeight: LEADING.display,
          color: INK,
        }),
        text(item.eventTitle, {
          marginTop: 14,
          width: "100%",
          fontSize: 29,
          fontWeight: WEIGHT.strong,
          letterSpacing: 29 * TRACK.title,
          lineHeight: LEADING.title,
          color: INK,
        }),
      ),
    ),
  );
}

export default ogCardElement;
