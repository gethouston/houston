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

const MEASURE = 1400;

const GAP = {
  name: 18,
  tagline: 18,
  event: 44,
  title: 20,
  date: 54,
};

const LABEL = 26;

export function nameSize(name) {
  const len = [...name].length;
  if (len <= 12) return 164;
  if (len <= 20) return 142;
  if (len <= 28) return 112;
  if (len <= 34) return 96;
  if (len <= 42) return 88;
  return 76;
}

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
        flexShrink: 0,
      },
    },
    centred(copy.thisCertifies, {
      fontSize: LABEL,
      fontWeight: WEIGHT.body,
      color: INK_SUBTLE,
    }),
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
