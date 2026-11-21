import { INK, INK_MUTED, rule, TRACK, text, WEIGHT } from "./chrome.mjs";
import h from "./h.mjs";

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
        text(`${copy.verifyAt} gethouston.ai/certificates/verify`, {
          marginTop: 14,
          fontSize: 24,
          fontWeight: WEIGHT.body,
          color: INK_MUTED,
        }),
      ),
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
