import { centred, HAIRLINE, INK, INK_MUTED } from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The certificate's citation: the claim, the recipient, the event, the date.
 *
 * The reading column of the document, centred on the glass panel's axis between
 * the letterhead and the verification row. It is the only part that changes per
 * attendee, which is why it lives apart from the panel that holds it, the
 * letterhead above it and the attestation beneath it.
 */

/** Widest a line may run inside the panel, in panel-content pixels. */
const MEASURE = 1420;

/**
 * The vertical rhythm, as gaps between the stack's blocks.
 *
 * Grouped, not evenly spaced: "this certifies that" belongs to the name it
 * introduces and "for completing" belongs to the event it introduces, so each
 * label hugs its subject and the air goes BETWEEN the two pairs. The date, which
 * qualifies nothing, is pushed furthest away and closes the stack.
 */
const GAP = {
  /** Claim to the name — a hug. */
  name: 14,
  /** Name to "for completing": the widest gap inside the citation. */
  event: 30,
  /** "for completing" to the event title — the other hug. */
  title: 20,
  /** Title to its tagline: a subtitle, so it stays inside the event's group. */
  tagline: 16,
  /**
   * Event group to the date rule. The widest gap in the stack after the one
   * under the name — the date belongs to no pair, and the rule has to read as
   * the line the citation stops on, not as another beat of the event block.
   */
  date: 48,
};

/**
 * Height reserved for the name, whatever rung of the ladder it lands on.
 *
 * Two pixels over the tallest line box the ladder can produce (146 x 1.14), so
 * a short name and a long one put the rest of the stack on the same line of the
 * glass. A name long enough to WRAP grows past it — deliberately: the panel's
 * flex spacers give that growth somewhere to go (see template-cert.mjs).
 */
const NAME_BAND = 168;

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
  if (len <= 18) return 146;
  if (len <= 26) return 126;
  if (len <= 36) return 108;
  return 88;
}

/** A hairline flanking the date. */
const flank = () =>
  h("div", {
    style: {
      display: "flex",
      width: 150,
      height: 1,
      backgroundColor: HAIRLINE,
    },
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
        marginTop: GAP.date,
      },
    },
    flank(),
    centred(dateDisplay, {
      margin: "0 30px",
      fontSize: 27,
      fontWeight: 400,
      letterSpacing: 1.4,
      color: INK_MUTED,
    }),
    flank(),
  );

/**
 * The citation stack: the claim, the recipient, the event, the date.
 *
 * Sits in the panel's reading band, between the letterhead above and the
 * verification row below, with the spare glass split around it by the spacers
 * in template-cert.mjs. It carries no leading margin of its own: the air over
 * the claim is that split's business, not the stack's.
 *
 * The two optional lines (tagline, date) drop out entirely rather than
 * reserving empty space — an event without a tagline gets a taller band of air
 * around a shorter citation, not a hole where the tagline would have been.
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
    centred(copy.thisCertifies, {
      fontSize: 34,
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
          marginTop: GAP.name,
          minHeight: NAME_BAND,
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
      marginTop: GAP.event,
      fontSize: 30,
      fontWeight: 300,
      color: INK_MUTED,
    }),
    // The event lines run to a narrower measure than the name: a long title
    // reads better broken than run edge to edge of the glass.
    centred(item.eventTitle, {
      marginTop: GAP.title,
      width: MEASURE,
      justifyContent: "center",
      textAlign: "center",
      fontSize: 56,
      fontWeight: 600,
      lineHeight: 1.24,
      color: INK,
    }),
    ...(item.eventTagline
      ? [
          centred(item.eventTagline, {
            marginTop: GAP.tagline,
            width: MEASURE,
            justifyContent: "center",
            textAlign: "center",
            fontSize: 30,
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
