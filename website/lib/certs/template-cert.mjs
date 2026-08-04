import { verificationRow } from "./attestation.mjs";
import { backdrop } from "./backdrop.mjs";
import { BODY_FONT, centred, INK_SUBTLE, lockup, navy } from "./chrome.mjs";
import { citation } from "./citation.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { canvas, panel, tint } from "./panel.mjs";

/**
 * The printable certificate: 2000x1414 landscape, the Houston photograph
 * full-bleed, and one pane of glass centred on it carrying the document.
 *
 * Everything is inside the panel — letterhead, claim, name, event, date, code
 * and QR — so the picture is never asked to be a background for type and a
 * picture at the same time. Outside the panel it is just the photograph: sky
 * above, the Earth's limb and the sunrise below and around.
 *
 * Down the panel the document reads in three blocks with air between them:
 * the letterhead at the top, the citation floating in the reading band, and the
 * verification row in the two bottom corners. What is between the citation and
 * that row is not a gap left over — it is the brightest part of the sunrise
 * coming up through the thinnest stops of the glass, and it is the reason the
 * panel sits on this photograph at all.
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
 * Through the middle it THINS to 0.83 — the last trace of the sunrise as a
 * warm breath under the glass. The ramp is near-opaque at the founder's
 * explicit, thrice-repeated request: the photograph frames the panel and
 * barely whispers through it.
 */
const PANEL = tint([
  [0.9, 0],
  [0.87, 30],
  [0.84, 55],
  [0.83, 70],
  [0.89, 86],
  [0.94, 100],
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

/**
 * How the glass that nothing is printed on is divided.
 *
 * The panel holds three blocks — letterhead, citation, verification row — and
 * whatever height they do not use. That slack is around 150px on a typical
 * certificate, and the version of this file that pooled ALL of it into one gap
 * under the citation left a dead band straight across the middle of the panel.
 * So it is split in two and the citation floats between the shares, landing
 * just above the panel's true centre — where a reading column has to sit to
 * look placed rather than dropped, since the QR outweighs the lockup.
 *
 * Ratios, not pixels: the share is `flex-grow` over FREE space, so a longer
 * citation takes air back from both gaps at once instead of eating only the one
 * beneath it. The floors are the whole budget a runaway certificate gets to
 * spend — 56px between them, against 68px of bottom padding under the QR. A
 * two-line name under a two-line title still clears the foot by 60px; the worst
 * input we could invent (two-line name, three-line title, two-line tagline)
 * spends the floors, overruns the padding and still leaves the chip 25px of
 * glass. Raising them is not free: every pixel added here is a pixel the QR
 * loses in that case.
 */
const AIR = {
  above: { grow: 1, min: 24 },
  below: { grow: 1.3, min: 32 },
};

/** A share of the panel's leftover height, never less than `min`. See AIR. */
const spacer = ({ grow, min }) =>
  h("div", { style: { display: "flex", flexGrow: grow, minHeight: min } });

/**
 * The letterhead: the issuer's mark with the document's name set under it.
 *
 * They are ONE block, close together. Set as far from the mark as the mark is
 * from the claim below, "CERTIFICATE OF COMPLETION" reads as a third small
 * thing floating in the top third rather than as the title of the page it is
 * printed on.
 */
const letterhead = (copy) => [
  lockup({ helmet: 88, word: 33, domain: 17, centred: true }),
  centred(copy.certificateOf, {
    marginTop: 42,
    fontSize: 25,
    fontWeight: 400,
    letterSpacing: 5.8,
    color: INK_SUBTLE,
  }),
];

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
      ...letterhead(copy),
      spacer(AIR.above),
      citation(item, copy),
      spacer(AIR.below),
      verificationRow(item, copy, qrSrc),
    ),
  );
}

export default certificateElement;
