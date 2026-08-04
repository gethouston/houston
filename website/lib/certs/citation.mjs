import { centred, HAIRLINE, INK, INK_MUTED, INK_SUBTLE } from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The certificate's citation: the claim, the recipient, the event, the date.
 *
 * Everything above the verification row, centred on the glass panel's axis. It is the
 * only part of the document that changes per attendee, which is why it lives
 * apart from the panel that holds it and the attestation beneath it.
 */

/** Widest a line may run inside the panel, in panel-content pixels. */
const MEASURE = 1420;

/**
 * Display size for the recipient's name. Stepped (not fluid) so every
 * certificate in a cohort reads as the same document; counted over code points
 * rather than UTF-16 units so an accented name steps at the width it looks.
 *
 * The bundled fonts are Latin only — a name outside that coverage is caught and
 * reported by `warnAboutMissingGlyphs` in render.mjs, not silently sized here.
 */
export function nameSize(name) {
  const len = [...name].length;
  if (len <= 18) return 128;
  if (len <= 26) return 110;
  if (len <= 36) return 94;
  return 78;
}

/** A hairline flanking the date. */
const flank = () =>
  h("div", {
    style: { display: "flex", width: 92, height: 1, backgroundColor: HAIRLINE },
  });

/** The rule-and-date row. */
const dateRow = (dateDisplay) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginTop: 28,
      },
    },
    flank(),
    centred(dateDisplay, {
      margin: "0 26px",
      fontSize: 25,
      fontWeight: 400,
      letterSpacing: 1.4,
      color: INK_MUTED,
    }),
    flank(),
  );

/**
 * The citation stack.
 *
 * Top-anchored inside the panel, so the recipient's name lands on the same line
 * of the glass on every certificate in a cohort whatever else the event does or
 * does not have. The two optional lines (tagline, date) drop out entirely
 * rather than reserving empty space.
 *
 * @param {object} item Mapped certificate item.
 * @param {object} copy Result of `certCopy(item.lang)`.
 */
export function citation(item, copy) {
  const size = nameSize(item.displayName);
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
      },
    },
    centred(copy.certificateOf, {
      marginTop: 40,
      fontSize: 23,
      fontWeight: 400,
      letterSpacing: 5.4,
      color: INK_SUBTLE,
    }),
    centred(copy.thisCertifies, {
      marginTop: 30,
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
          minHeight: 148,
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
      fontSize: 27,
      fontWeight: 300,
      color: INK_MUTED,
    }),
    // The event lines run to a narrower measure than the name: a long title
    // reads better broken than run edge to edge of the glass.
    centred(item.eventTitle, {
      marginTop: 16,
      width: MEASURE,
      justifyContent: "center",
      textAlign: "center",
      fontSize: 47,
      fontWeight: 600,
      lineHeight: 1.24,
      color: INK,
    }),
    ...(item.eventTagline
      ? [
          centred(item.eventTagline, {
            marginTop: 14,
            width: MEASURE,
            justifyContent: "center",
            textAlign: "center",
            fontSize: 26,
            fontWeight: 300,
            lineHeight: 1.3,
            color: INK_MUTED,
          }),
        ]
      : []),
    ...(item.eventDateDisplay ? [dateRow(item.eventDateDisplay)] : []),
  );
}

export default citation;
