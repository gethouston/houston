import { signatureRow, verificationRow } from "./attestation.mjs";
import { backdrop } from "./backdrop.mjs";
import { BODY_FONT, lockup, navy } from "./chrome.mjs";
import { citation } from "./citation.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { canvas, panel, tint } from "./panel.mjs";

/**
 * The printable certificate: 2000x1414 landscape, the Houston photograph
 * full-bleed, and one pane of glass centred on it carrying the document.
 *
 * Everything is inside the panel — lockup, claim, name, event, date,
 * signatures, code and QR — so the picture is never asked to be a background
 * for type and a picture at the same time. Outside the panel it is just the
 * photograph: sky above, the Earth's limb and the sunrise below and around.
 */
export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414;

/** Photograph left visible on all four sides of the panel. */
const INSET = 96;

/**
 * The panel tint (see panel.mjs for why it is a ramp).
 *
 * It runs the other way from the obvious one. The sky at the top needs the most
 * tint, because that is where the type is smallest and the picture emptiest.
 * Through the middle it THINS to 0.37 — the sunrise sits behind that band, and
 * every extra hundredth there turns warm light into grey haze. Only the last
 * eighth deepens again, to 0.60, and only because the code and the QR sit on
 * the brightest pixels in the photograph.
 */
const PANEL = tint([
  [0.46, 0],
  [0.42, 30],
  [0.38, 55],
  [0.37, 70],
  [0.46, 86],
  [0.64, 100],
]);

/**
 * The wash on the photograph itself, now that the panel carries the contrast.
 *
 * A vignette and nothing else, and a faint one: the old full-bleed scrim ran to
 * 0.54 across the sky because the type used to sit straight on it. Anything
 * near that here crushes the frame's top strip to flat black and throws away
 * the stars the panel is supposed to be floating in front of.
 */
const VIGNETTE = `linear-gradient(180deg, ${navy(0.09)} 0%, ${navy(0.01)} 24%, ${navy(0)} 58%, ${navy(0.03)} 82%, ${navy(0.14)} 100%)`;

export function certificateElement(item, qrSrc) {
  const copy = certCopy(item.lang);

  return h(
    "div",
    { style: canvas(CERT_WIDTH, CERT_HEIGHT, BODY_FONT) },
    ...backdrop(CERT_WIDTH, CERT_HEIGHT, { focusY: 0.5, scrim: VIGNETTE }),
    panel(
      {
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        inset: INSET,
        radius: 26,
        // Near-square inner margins: the QR chip is a solid white block in the
        // bottom corner, and an uneven gap round it is the first thing the eye
        // finds. The foot is 8px tighter than the sides only because the code
        // beside the chip carries descender space the chip does not.
        padding: "52px 76px 68px 76px",
        background: PANEL,
        centred: true,
      },
      lockup({ helmet: 88, word: 33, domain: 17, centred: true }),
      citation(item, copy),
      // Bottom-anchored from here down: the attestation sits on the panel's
      // lower edge whatever the length of the citation above it.
      //
      // Pure `flex:1`, deliberately — no minimum. A floor here would look like
      // it guarantees air, and in the one case that matters (an event with a
      // title long enough to run to three lines) it would instead push the QR
      // out through the bottom of the glass. Letting the gap close to nothing
      // is a worse-looking certificate; clipping the QR is a broken one.
      h("div", { style: { display: "flex", flex: 1 } }),
      signatureRow(),
      verificationRow(item, copy, qrSrc),
    ),
  );
}

export default certificateElement;
