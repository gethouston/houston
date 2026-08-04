import { INK, INK_MUTED, text } from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The certificate's lower band: how anyone can check it is real.
 *
 * It lives apart from the layout in template-cert.mjs because it is the half of
 * the document that has nothing to do with the attendee — the verification
 * affordance is the same on every certificate Houston issues.
 *
 * The row sits on the deepest stops of the glass panel (panel.mjs), which is
 * what buys it its contrast over the sunrise burning through behind it.
 */

/**
 * Code and verification URL on the left, QR on the right — the panel's two
 * bottom corners, with the bright core of the glow left alone between them.
 *
 * The row sets no margin of its own. How far it sits from the citation is a
 * property of the panel's composition, not of the row, and template-cert.mjs
 * owns that (see `AIR`).
 *
 * @param {object} item Mapped certificate item.
 * @param {object} copy Result of `certCopy(item.lang)`.
 * @param {string} qrSrc QR code as a data URL.
 */
export function verificationRow(item, copy, qrSrc) {
  return h(
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
      { style: { display: "flex", flexDirection: "column" } },
      text(item.code, {
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: 4.8,
        color: INK,
      }),
      // The smallest type on the busiest ground: it gets the brighter ink.
      text(`${copy.verifyAt} gethouston.ai/certificates/verify`, {
        marginTop: 12,
        fontSize: 21,
        fontWeight: 400,
        color: INK_MUTED,
      }),
    ),
    // The QR keeps its white chip: it has to scan off a phone camera pointed at
    // a photograph, and the quiet zone is not negotiable. A verification URL
    // encodes as a version-3 symbol (29 modules), so 176px makes a module 6.1px
    // and the spec's four-module margin 25px — hence the padding below, which is
    // the quiet zone, not decoration.
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
  );
}
