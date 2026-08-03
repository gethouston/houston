import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

/**
 * The printable certificate: 2000x1414 landscape (A4/letter ratio at ~170dpi),
 * white ground, hairline frame, one black bar at the top edge of the frame.
 *
 * Written as a satori element tree (see h.mjs). satori implements a SUBSET of
 * flexbox and has no block layout, so every container declares `display:"flex"`
 * and an explicit `flexDirection`; spacing is explicit margins, never collapse.
 */
export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414;

const FONT = "Hanken Grotesk";
const INK = "#0d0d0d";
const INK_MUTED = "#5d5d5d";
const INK_SUBTLE = "#676767";
const RULE = "#e3e3e3";
const FRAME_LINE = "rgba(13, 13, 13, 0.16)";

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
  if (len <= 26) return 112;
  if (len <= 36) return 92;
  return 76;
}

/**
 * A line of text.
 *
 * satori adds the tracking after the LAST glyph too, so a centred, tracked line
 * lands letterSpacing/2 to the left of the true axis (measured: -4px on the
 * wordmark). Shrink-to-fit lines get a compensating left margin — flex centring
 * splits it evenly, so one full step of margin moves the ink back by half. Full
 * width lines centre their own text and need no correction.
 */
const text = (content, style) => {
  const track = style.width ? 0 : (style.letterSpacing ?? 0);
  return h(
    "div",
    {
      style: {
        display: "flex",
        ...(track ? { marginLeft: track } : {}),
        ...style,
      },
    },
    content,
  );
};

export function certificateElement(item, qrSrc) {
  const copy = certCopy(item.lang);
  const size = nameSize(item.displayName);
  const helmetHeight = 88;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        padding: 88,
        backgroundColor: "#ffffff",
        fontFamily: FONT,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          border: `2px solid ${FRAME_LINE}`,
        },
      },
      // The signature band: a solid bar filling the top of the frame.
      h("div", {
        style: {
          display: "flex",
          width: "100%",
          height: 22,
          backgroundColor: "#0a0a0a",
        },
      }),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "0 96px 56px 96px",
          },
        },
        // ── Centred document column ──────────────────────────────────────
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            },
          },
          h("img", {
            src: helmetDataUrl(INK),
            width: Math.round(helmetHeight * HELMET_RATIO),
            height: helmetHeight,
            style: { display: "flex" },
          }),
          text("HOUSTON", {
            marginTop: 18,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 6.4,
            color: INK,
          }),
          text(copy.certificateOf, {
            marginTop: 44,
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: 4.84,
            color: INK_SUBTLE,
          }),
          h("div", {
            style: {
              display: "flex",
              width: "40%",
              height: 1,
              marginTop: 30,
              backgroundColor: RULE,
            },
          }),
          text(copy.thisCertifies, {
            marginTop: 44,
            fontSize: 30,
            fontWeight: 400,
            color: INK_MUTED,
          }),
          text(item.displayName, {
            marginTop: 14,
            width: "100%",
            justifyContent: "center",
            textAlign: "center",
            fontSize: size,
            fontWeight: 300,
            letterSpacing: size * -0.03,
            lineHeight: 1.2,
            color: INK,
          }),
          text(copy.forCompleting, {
            marginTop: 22,
            fontSize: 26,
            fontWeight: 400,
            color: INK_MUTED,
          }),
          text(item.eventTitle, {
            marginTop: 14,
            width: "100%",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 46,
            fontWeight: 600,
            lineHeight: 1.25,
            color: INK,
          }),
          // Optional: events without a tagline drop the line entirely rather
          // than reserving empty space for it.
          ...(item.eventTagline
            ? [
                text(item.eventTagline, {
                  marginTop: 12,
                  width: "100%",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: 26,
                  fontWeight: 400,
                  lineHeight: 1.3,
                  color: INK_MUTED,
                }),
              ]
            : []),
          // Optional for the same reason as the tagline: an event with no
          // usable date drops the line rather than reserving a blank one.
          ...(item.eventDateDisplay
            ? [
                text(item.eventDateDisplay, {
                  marginTop: 34,
                  fontSize: 28,
                  fontWeight: 400,
                  color: INK,
                }),
              ]
            : []),
        ),
        // ── Footer: issuer · verification code · QR ──────────────────────
        // Three equal columns rather than a bare space-between row, so the
        // code block sits on the document's true optical centre even though
        // the issuer text and the QR have very different widths.
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              width: "100%",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                alignItems: "flex-start",
              },
            },
            text(copy.issuedBy, {
              fontSize: 22,
              fontWeight: 400,
              color: INK_SUBTLE,
            }),
            text("gethouston.ai", {
              marginTop: 8,
              fontSize: 22,
              fontWeight: 400,
              color: INK_SUBTLE,
            }),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                alignItems: "center",
              },
            },
            text(item.code, {
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 4.2,
              color: INK,
            }),
            text(`${copy.verifyAt} gethouston.ai/certificates/verify`, {
              marginTop: 10,
              fontSize: 20,
              fontWeight: 400,
              color: INK_SUBTLE,
            }),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                alignItems: "flex-end",
              },
            },
            h("img", {
              src: qrSrc,
              width: 200,
              height: 200,
              style: { display: "flex" },
            }),
          ),
        ),
      ),
    ),
  );
}

export default certificateElement;
