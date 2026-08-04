import { NAVY, navy } from "./chrome.mjs";
import h from "./h.mjs";

/**
 * The glass panel: one translucent slab of the photograph's own navy, inset
 * from the frame so the picture still reads all the way round it, carrying
 * every word of the document.
 *
 * satori has no `backdrop-filter`, so there is no blur to hide behind — the
 * illusion is made of exactly two things and both have to be right:
 *
 *  1. **Alpha low enough that the scene survives.** Under ~0.35 the type loses
 *     the sunrise; over ~0.60 the panel stops being glass and becomes a grey
 *     card stuck on a photo. The tint is also the photograph's own darkest sky
 *     (#040c1e) rather than black, so it darkens the picture instead of
 *     desaturating it.
 *  2. **A lit edge.** A single warm-white hairline is what tells the eye there
 *     is a pane of something there. Without it the panel reads as a smudge.
 *
 * The tint is a gradient, not a flat wash, for one reason: the sunrise sits
 * behind the panel's lower third, exactly where the signatures, the code and
 * the QR are. Deepening the last stops buys those their contrast while the
 * middle of the panel stays open enough for the glow to come through, which is
 * the whole point of putting the panel on this photograph at all.
 */

/** The lit edge. Warm white, barely there — see (2) above. */
export const PANEL_EDGE = "rgba(250, 249, 245, 0.18)";

/**
 * A vertical tint ramp for a panel background.
 *
 * @param {Array<[number, number]>} stops `[alpha, percent]` pairs, top to bottom.
 */
export const tint = (stops) =>
  `linear-gradient(180deg, ${stops
    .map(([alpha, at]) => `${navy(alpha)} ${at}%`)
    .join(", ")})`;

/**
 * The panel itself: a column that the canvas root centres.
 *
 * Sized explicitly rather than by margin so the inset is symmetrical whatever
 * the content does, and `overflow:hidden` so a long line can never spill past
 * the rounded corner it was supposed to sit inside.
 *
 * @param {object} options
 * @param {number} options.width Canvas width; the inset is subtracted here.
 * @param {number} options.height Canvas height.
 * @param {number} options.inset Photograph left visible on all four sides.
 * @param {number} options.radius Corner radius.
 * @param {string} options.padding CSS shorthand for the inner padding.
 * @param {string} options.background Result of `tint(...)`.
 * @param {boolean} [options.centred] Centre the children on the panel's axis.
 * @param {...object} children
 */
export function panel(
  { width, height, inset, radius, padding, background, centred = false },
  ...children
) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        ...(centred ? { alignItems: "center" } : {}),
        width: width - inset * 2,
        height: height - inset * 2,
        padding,
        borderRadius: radius,
        border: `1px solid ${PANEL_EDGE}`,
        backgroundImage: background,
        overflow: "hidden",
      },
    },
    ...children,
  );
}

/**
 * The canvas root: the photograph's navy as a fallback, and the centring that
 * places the panel inside its inset.
 *
 * @param {number} width
 * @param {number} height
 * @param {string} fontFamily
 */
export const canvas = (width, height, fontFamily) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  overflow: "hidden",
  width,
  height,
  backgroundColor: NAVY,
  fontFamily,
});
