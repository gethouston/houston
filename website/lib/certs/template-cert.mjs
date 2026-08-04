import { signatureRow, verificationRow } from "./attestation.mjs";
import {
  BODY_FONT,
  backdrop,
  centred,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  lockup,
  NAVY,
  navy,
} from "./chrome.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";

/**
 * The printable certificate: 2000x1414 landscape, the Houston photograph
 * full-bleed, every word set straight onto it in warm white.
 *
 * The composition is dictated by the photograph. Its top two thirds are deep
 * navy sky and carry the document's voice — issuer, claim, name, event. The
 * sunrise on the horizon is left empty and becomes the gap BETWEEN the two
 * signatures; the code and the QR take the darker bottom corners so nothing
 * sits on the bright core of the glow.
 */
export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414;

/**
 * The scrim, in one gradient (see chrome.mjs).
 *
 * Heaviest across the sky, where the type is, and gone by the horizon so the
 * sunrise is the photographer's, not ours. It lifts again over the last tenth
 * as a plain vignette, which is what buys the code its contrast over the city
 * lights without putting a panel behind it.
 */
const SCRIM = [
  "linear-gradient(180deg",
  `${navy(0.46)} 0%`,
  `${navy(0.54)} 42%`,
  `${navy(0.34)} 58%`,
  `${navy(0.1)} 70%`,
  `${navy(0.05)} 78%`,
  `${navy(0.33)} 92%`,
  `${navy(0.62)} 100%)`,
].join(", ");

/**
 * Display size for the recipient's name. Stepped (not fluid) so every
 * certificate in a cohort reads as the same document; counted over code points
 * rather than UTF-16 units so an accented name steps at the width it looks.
 *
 * The bundled fonts are Latin only — a name outside that coverage is caught and
 * reported by `warnAboutMissingGlyphs` in render.mjs, not silently sized here.
 */
function nameSize(name) {
  const len = [...name].length;
  if (len <= 18) return 132;
  if (len <= 26) return 114;
  if (len <= 36) return 96;
  return 80;
}

/** A hairline flanking the date. */
const flank = () =>
  h("div", {
    style: { display: "flex", width: 96, height: 1, backgroundColor: HAIRLINE },
  });

export function certificateElement(item, qrSrc) {
  const copy = certCopy(item.lang);
  const size = nameSize(item.displayName);

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        backgroundColor: NAVY,
        fontFamily: BODY_FONT,
      },
    },
    ...backdrop(CERT_WIDTH, CERT_HEIGHT, { focusY: 0.5, scrim: SCRIM }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          height: "100%",
          padding: "76px 140px 84px 140px",
        },
      },
      lockup({ helmet: 92, word: 34, domain: 17, centred: true }),
      // ── The claim ────────────────────────────────────────────────────────
      // Top-anchored, so the recipient's name lands on the same line of the sky
      // on every certificate in a cohort whatever else the event does or does
      // not have.
      centred(copy.certificateOf, {
        marginTop: 68,
        fontSize: 23,
        fontWeight: 400,
        letterSpacing: 5.4,
        color: INK_SUBTLE,
      }),
      centred(copy.thisCertifies, {
        marginTop: 42,
        fontSize: 31,
        fontWeight: 300,
        color: INK_MUTED,
      }),
      // Fixed height: the name ladder must not shift everything under it.
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minHeight: 166,
            marginTop: 6,
          },
        },
        centred(item.displayName, {
          width: "100%",
          justifyContent: "center",
          textAlign: "center",
          fontSize: size,
          fontWeight: 300,
          letterSpacing: size * -0.03,
          lineHeight: 1.14,
          color: INK,
        }),
      ),
      centred(copy.forCompleting, {
        marginTop: 4,
        fontSize: 27,
        fontWeight: 300,
        color: INK_MUTED,
      }),
      // The event lines run to a narrower measure than the name: it keeps a
      // long title off the ship flying through the right of the frame, and a
      // tagline reads better short anyway.
      centred(item.eventTitle, {
        marginTop: 16,
        width: 1400,
        justifyContent: "center",
        textAlign: "center",
        fontSize: 47,
        fontWeight: 600,
        lineHeight: 1.24,
        color: INK,
      }),
      // Optional: events without a tagline drop the line entirely rather than
      // reserving empty space for it.
      ...(item.eventTagline
        ? [
            centred(item.eventTagline, {
              marginTop: 14,
              width: 1400,
              justifyContent: "center",
              textAlign: "center",
              fontSize: 26,
              fontWeight: 300,
              lineHeight: 1.3,
              color: INK_MUTED,
            }),
          ]
        : []),
      // Optional for the same reason: an event with no usable date drops the
      // rule-and-date row rather than leaving two hairlines around nothing.
      ...(item.eventDateDisplay
        ? [
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 38,
                },
              },
              flank(),
              centred(item.eventDateDisplay, {
                margin: "0 26px",
                fontSize: 25,
                fontWeight: 400,
                letterSpacing: 1.4,
                color: INK_MUTED,
              }),
              flank(),
            ),
          ]
        : []),
      // Bottom-anchored from here down: the signatures straddle the sunrise and
      // the footer takes the two dark corners, both fixed against the horizon
      // rather than floating on the length of the copy above.
      h("div", { style: { display: "flex", flex: 1 } }),
      signatureRow(),
      verificationRow(item, copy, qrSrc),
    ),
  );
}

export default certificateElement;
