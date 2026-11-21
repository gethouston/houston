import { verificationFoot } from "./attestation.mjs";
import { backdrop } from "./backdrop.mjs";
import { BRAND_FONT, eyebrow, INK_SUBTLE, lockup, navy } from "./chrome.mjs";
import { citation } from "./citation.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { canvas, panel, tint } from "./panel.mjs";

export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414;

const INSET = 96;

const PANEL = tint([
  [0.9, 0],
  [0.87, 30],
  [0.84, 55],
  [0.83, 70],
  [0.89, 86],
  [0.94, 100],
]);

const VIGNETTE = `linear-gradient(180deg, ${navy(0.09)} 0%, ${navy(0.01)} 24%, ${navy(0)} 58%, ${navy(0.03)} 82%, ${navy(0.14)} 100%)`;

const AIR = {
  above: { grow: 1, min: 22 },
  below: { grow: 1.15, min: 30 },
};

const spacer = ({ grow, min }) =>
  h("div", {
    style: { display: "flex", flexGrow: grow, flexShrink: 0, minHeight: min },
  });

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
