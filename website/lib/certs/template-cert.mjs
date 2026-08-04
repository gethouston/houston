import { verificationFoot } from "./attestation.mjs";
import { backdrop } from "./backdrop.mjs";
import { BRAND_FONT, eyebrow, INK_SUBTLE, lockup, navy } from "./chrome.mjs";
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
 * The panel holds three blocks — letterhead, citation, verification foot — and
 * whatever height they do not use. That slack is around 110px on a typical
 * certificate, and the version of this file that pooled ALL of it into one gap
 * under the citation left a dead band straight across the middle of the panel.
 * So it is split in two and the citation floats between the shares, landing
 * just above the panel's true centre — where a reading column has to sit to
 * look placed rather than dropped, since the foot outweighs the lockup.
 *
 * Ratios, not pixels: the share is `flex-grow` over FREE space, so a longer
 * citation takes air back from both gaps at once instead of eating only the one
 * beneath it. The floors are the whole budget a runaway certificate gets to
 * spend — 52px between them, against 64px of bottom padding under the QR. A
 * two-line name under a two-line title still clears the foot; the worst input
 * we could invent (two-line name, three-line title, two-line tagline) spends
 * the floors, overruns the padding and still leaves the chip glass to sit on.
 * Raising them is not free: every pixel added here is a pixel the QR loses in
 * that case.
 */
const AIR = {
  above: { grow: 1, min: 22 },
  below: { grow: 1.15, min: 30 },
};

/**
 * A share of the panel's leftover height, never less than `min`. See AIR.
 *
 * `flexShrink: 0` on every block in the panel, this one included: yoga's
 * default is to shrink fixed-height children to fit, which on this layout drew
 * the citation straight over the letterhead. Nothing shrinks now — an
 * impossible certificate overruns the bottom padding instead, where the only
 * thing it can cost is glass under the QR.
 */
const spacer = ({ grow, min }) =>
  h("div", {
    style: { display: "flex", flexGrow: grow, flexShrink: 0, minHeight: min },
  });

/**
 * The letterhead: the issuer's mark with the document's name set under it.
 *
 * Set at LETTERHEAD scale, not at nav scale. The mark used to run at an 88px
 * helmet beside a 33px wordmark on a 1808px-wide panel — under 5% of the
 * measure, so it floated in the top third with no more weight than a caption.
 * A helmet of 116 against a 56px wordmark is the same lockup at the size a
 * document this big asks for, and it is the SITE's wordmark now: title case,
 * General Sans 500, -0.02em (chrome.mjs).
 *
 * The two are ONE block, close together. Set as far from the mark as the mark
 * is from the claim below, "CERTIFICATE OF PARTICIPATION" reads as a third
 * small thing floating in the top third rather than as the title of the page it
 * is printed on. It is an eyebrow in the landing's voice — uppercase, semibold,
 * openly tracked — where it used to be a 25px regular at 0.23em, a tracking
 * nothing on the site uses.
 */
const letterhead = (copy) => [
  lockup({ helmet: 116, word: 56, domain: 22, centred: true }),
  eyebrow(copy.certificateOf, 27, {
    marginTop: 38,
    flexShrink: 0,
    color: INK_SUBTLE,
  }),
];

export function certificateElement(item, qrSrc) {
  const copy = certCopy(item.lang);

  return h(
    "div",
    { style: canvas(CERT_WIDTH, CERT_HEIGHT, BRAND_FONT) },
    ...backdrop(CERT_WIDTH, CERT_HEIGHT, { focusY: 0.5, scrim: VIGNETTE }),
    panel(
      {
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        inset: INSET,
        radius: 26,
        // Near-square inner margins: the QR chip is a solid white block in the
        // bottom corner, and an uneven gap round it is the first thing the eye
        // finds. The head is deeper than the foot because the lockup is the
        // one block with nothing above it to hold it down.
        padding: "76px 88px 64px 88px",
        background: PANEL,
        centred: true,
      },
      ...letterhead(copy),
      spacer(AIR.above),
      citation(item, copy),
      spacer(AIR.below),
      verificationFoot(item, copy, qrSrc),
    ),
  );
}

export default certificateElement;
