import { INK, INK_MUTED, rule, TRACK, text, WEIGHT } from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The certificate's lower band: how anyone can check it is real.
 *
 * It lives apart from the layout in template-cert.mjs because it is the half of
 * the document that has nothing to do with the attendee — the verification
 * affordance is the same on every certificate Houston issues.
 *
 * The band opens with a hairline across the full measure. That line is doing
 * real work, not decoration: the panel tint is near-opaque now, so the glass
 * under the citation is flat, and without an edge the code and the QR read as
 * two objects abandoned in opposite corners with a hole between them. Ruled
 * off, they read as one foot — the same move the site makes at `.lfoot`.
 */

/**
 * Code and verification URL on the left, QR on the right, under one rule.
 *
 * The two sides are CENTRED against each other rather than sat on a shared
 * baseline. The chip is 228px tall against ~100px of type, so baseline-aligning
 * them hangs the text off the bottom of a tall white block and leaves the left
 * corner visibly empty — the imbalance the founder called out. Centred, the
 * type sits on the chip's optical axis and the band reads as one row.
 *
 * The row sets no margin of its own. How far it sits from the citation is a
 * property of the panel's composition, not of the row, and template-cert.mjs
 * owns that (see `AIR`).
 *
 * @param {object} item Mapped certificate item.
 * @param {object} copy Result of `certCopy(item.lang)`.
 * @param {string} qrSrc QR code as a data URL.
 */
export function verificationFoot(item, copy, qrSrc) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        // Never squeezed by a citation that overran: see citation.mjs.
        flexShrink: 0,
      },
    },
    rule("100%"),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          marginTop: 34,
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        text(item.code, {
          fontSize: 48,
          fontWeight: WEIGHT.strong,
          letterSpacing: 48 * TRACK.code,
          color: INK,
        }),
        // The smallest type on the busiest ground: it gets the brighter ink.
        text(`${copy.verifyAt} gethouston.ai/certificates/verify`, {
          marginTop: 14,
          fontSize: 24,
          fontWeight: WEIGHT.body,
          color: INK_MUTED,
        }),
      ),
      // The QR keeps its white chip: it has to scan off a phone camera pointed
      // at a photograph, and the quiet zone is not negotiable. A verification
      // URL encodes as a version-3 symbol (29 modules), so 176px makes a module
      // 6.1px and the spec's four-module margin 25px — hence the padding below,
      // which is the quiet zone, not decoration.
      h(
        "div",
        {
          style: {
            display: "flex",
            padding: 26,
            borderRadius: 20,
            backgroundColor: "#ffffff",
          },
        },
        h("img", {
          src: qrSrc,
          width: 176,
          height: 176,
          style: { display: "flex" },
        }),
      ),
    ),
  );
}
