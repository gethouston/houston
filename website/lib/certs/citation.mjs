import {
  centred,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  LEADING,
  rule,
  TRACK,
  WEIGHT,
} from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The certificate's citation: the claim, the recipient, the event, the date.
 *
 * The reading column of the document, centred on the glass panel's axis between
 * the letterhead and the verification foot. It is the only part that changes
 * per attendee, which is why it lives apart from all three.
 *
 * The hierarchy is the landing page's, not a document convention: ONE display
 * line at `.hero-h1` weight and tracking (the name), a semibold sub-head under
 * it (the event), and everything that merely introduces them dropped to quiet
 * body type. Before this the connectives ran at 30-34px against a 56px title
 * and the whole band read flat.
 */

/** Widest a line may run inside the panel, in panel-content pixels. */
const MEASURE = 1400;

/**
 * The vertical rhythm, as gaps between the stack's blocks.
 *
 * Grouped, not evenly spaced: "this certifies that" belongs to the name it
 * introduces and "for participating in" belongs to the event it introduces, so
 * each label hugs its subject and the air goes BETWEEN the two pairs. The date,
 * which qualifies nothing, is pushed furthest away and closes the stack.
 *
 * The steps are the landing's own section rhythm scaled to this canvas: a hug
 * is ~0.7x the connective size, the gap between the two groups ~1.7x, and the
 * closing gap ~2.1x — the ratio `--section-pad` (104px) keeps against the
 * site's 16px body type.
 */
const GAP = {
  /** Claim to the name, and title to tagline — the two hugs. */
  name: 18,
  tagline: 18,
  /** Name to "for participating in": the widest gap inside the citation. */
  event: 44,
  /** "for participating in" to the event title — the third hug. */
  title: 20,
  /**
   * Event group to the date rule. The widest gap in the stack after the one
   * under the name — the date belongs to no pair, and the rule has to read as
   * the line the citation stops on, not as another beat of the event block.
   */
  date: 54,
};

/** Size of the connective lines that introduce the name and the event. */
const LABEL = 26;

/**
 * Display size for the recipient's name. Stepped (not fluid) so every
 * certificate in a cohort reads as the same document; counted over code points
 * rather than UTF-16 units so an accented name steps at the width it looks.
 *
 * Re-cut for General Sans, a wider face than the Hanken Light this used to be
 * set in and now set at the wordmark's weight: the same name covers MORE of the
 * panel at a SMALLER size than the old ladder gave it. Each rung is the largest
 * size at which the longest name of that length still clears the panel's 1632px
 * of content with an optical margin either side.
 *
 * A name outside the bundle's coverage is caught and reported by
 * `warnAboutMissingGlyphs` in render.mjs, not silently sized here.
 */
export function nameSize(name) {
  const len = [...name].length;
  if (len <= 12) return 164;
  if (len <= 20) return 142;
  if (len <= 28) return 112;
  if (len <= 34) return 96;
  if (len <= 42) return 88;
  // Past here the name wraps whatever we do, so the rung's job changes: keep
  // the second line from pushing the foot off the glass.
  return 76;
}

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
    rule(170),
    centred(dateDisplay, {
      margin: "0 34px",
      fontSize: 24,
      fontWeight: WEIGHT.body,
      letterSpacing: 24 * TRACK.meta,
      color: INK_MUTED,
    }),
    rule(170),
  );

/**
 * The citation stack: the claim, the recipient, the event, the date.
 *
 * Sits in the panel's reading band, with the spare glass split around it by the
 * spacers in template-cert.mjs. It carries no leading margin of its own: the
 * air over the claim is that split's business, not the stack's.
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
        // The panel is a fixed-height flex column, so an over-long citation
        // would otherwise be SHRUNK by yoga rather than allowed to overflow —
        // and a shrunk block draws its lines on top of the letterhead above it.
        // Overrunning the bottom padding is survivable; overlapping type is not.
        flexShrink: 0,
      },
    },
    centred(copy.thisCertifies, {
      fontSize: LABEL,
      fontWeight: WEIGHT.body,
      color: INK_SUBTLE,
    }),
    // No reserved name band: a fixed slot sized for the tallest rung left up
    // to 97px of dead air around a long name, right where the founder saw the
    // hole. The stack flows; the panel's flex spacers keep it optically
    // centred whatever height it comes to.
    centred(item.displayName, {
      marginTop: GAP.name,
      width: "100%",
      justifyContent: "center",
      textAlign: "center",
      fontSize: size,
      fontWeight: WEIGHT.display,
      letterSpacing: size * TRACK.display,
      lineHeight: LEADING.display,
      color: INK,
    }),
    centred(copy.forCompleting, {
      marginTop: GAP.event,
      fontSize: LABEL,
      fontWeight: WEIGHT.body,
      color: INK_SUBTLE,
    }),
    // The event lines run to a narrower measure than the name: a long title
    // reads better broken than run edge to edge of the glass.
    centred(item.eventTitle, {
      marginTop: GAP.title,
      width: MEASURE,
      justifyContent: "center",
      textAlign: "center",
      fontSize: 58,
      fontWeight: WEIGHT.strong,
      letterSpacing: 58 * TRACK.title,
      lineHeight: LEADING.title,
      color: INK,
    }),
    ...(item.eventTagline
      ? [
          centred(item.eventTagline, {
            marginTop: GAP.tagline,
            width: MEASURE,
            justifyContent: "center",
            textAlign: "center",
            fontSize: 28,
            fontWeight: WEIGHT.body,
            lineHeight: LEADING.body,
            color: INK_MUTED,
          }),
        ]
      : []),
    ...(item.eventDateDisplay ? [dateRow(item.eventDateDisplay)] : []),
  );
}

export default citation;
