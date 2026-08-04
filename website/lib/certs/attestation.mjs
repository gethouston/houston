import {
  centred,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  SCRIPT_FONT,
  text,
} from "./chrome.mjs";
import h from "./h.mjs";
import { SIGNERS } from "./signers.mjs";

/**
 * The certificate's lower band: who attested to it, and how anyone can check.
 *
 * It lives apart from the layout in template-cert.mjs because it is the half of
 * the document that has nothing to do with the attendee — the signers and the
 * verification affordance are the same on every certificate Houston issues.
 *
 * Both rows sit on the deepest stops of the glass panel (panel.mjs), which is
 * what buys them their contrast over the sunrise burning through behind them.
 */

/**
 * One signer: the script signature, a rule, the name and the title.
 *
 * `image` (a scan) wins when we have one; until then the name is set in Great
 * Vibes, which is a signature typeface rather than a claim to be somebody's
 * actual hand.
 */
function signature(signer) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 500,
      },
    },
    signer.image
      ? h("img", {
          src: signer.image,
          height: 72,
          style: { display: "flex", marginBottom: 10 },
        })
      : centred(signer.script, {
          height: 78,
          alignItems: "center",
          fontFamily: SCRIPT_FONT,
          fontSize: 62,
          fontWeight: 400,
          // Great Vibes sets very tight; without this the words of a two-part
          // name run into each other and stop reading as two words. satori
          // ignores `wordSpacing`, so the tracking has to do that job.
          letterSpacing: 2,
          color: INK,
        }),
    h("div", {
      style: {
        display: "flex",
        width: "100%",
        height: 1,
        marginTop: 10,
        backgroundColor: HAIRLINE,
      },
    }),
    centred(signer.name, {
      marginTop: 16,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 1.2,
      color: INK,
    }),
    centred(signer.title, {
      marginTop: 8,
      fontSize: 19,
      fontWeight: 400,
      color: INK_SUBTLE,
    }),
  );
}

/**
 * Both signers, pushed out to the sides of the panel so the core of the sunrise
 * comes through the glass between them rather than under either of them.
 */
export function signatureRow() {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        width: "100%",
        padding: "0 56px",
      },
    },
    ...SIGNERS.map(signature),
  );
}

/**
 * Code and verification URL on the left, QR on the right — the panel's two
 * bottom corners, with the bright core of the glow left alone between them.
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
        marginTop: 40,
      },
    },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      text(item.code, {
        fontSize: 31,
        fontWeight: 600,
        letterSpacing: 4.4,
        color: INK,
      }),
      // The smallest type on the busiest ground: it gets the brighter ink.
      text(`${copy.verifyAt} gethouston.ai/certificates/verify`, {
        marginTop: 12,
        fontSize: 20,
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
