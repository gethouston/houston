import { backdrop } from "./backdrop.mjs";
import {
  BRAND_FONT,
  HAIRLINE,
  INK,
  INK_MUTED,
  INK_SUBTLE,
  LEADING,
  lockup,
  navy,
  TRACK,
  text,
  WEIGHT,
} from "./chrome.mjs";
import { certCopy } from "./copy.mjs";
import h from "./h.mjs";
import { canvas, panel, tint } from "./panel.mjs";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const INSET = 40;

const PANEL = tint([
  [0.88, 0],
  [0.85, 36],
  [0.82, 62],
  [0.87, 82],
  [0.92, 100],
]);

const VIGNETTE = `linear-gradient(180deg, ${navy(0.1)} 0%, ${navy(0.01)} 28%, ${navy(0)} 62%, ${navy(0.12)} 100%)`;

function nameSize(name) {
  const len = [...name].length;
  if (len <= 12) return 100;
  if (len <= 20) return 88;
  if (len <= 28) return 70;
  if (len <= 34) return 60;
  return 54;
}

export function ogCardElement(item) {
  const copy = certCopy(item.lang);
  const size = nameSize(item.displayName);
  const meta = [item.eventDateDisplay, item.code].filter(Boolean).join("  ·  ");

  return h(
    "div",
    { style: canvas(OG_WIDTH, OG_HEIGHT, BRAND_FONT) },
    ...backdrop(OG_WIDTH, OG_HEIGHT, { focusY: 0.5, scrim: VIGNETTE }),
    panel(
      {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        inset: INSET,
        radius: 22,
        padding: "44px 54px 48px 54px",
        background: PANEL,
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          },
        },
        lockup({ helmet: 60, word: 29, domain: 13 }),
        text(meta, {
          fontSize: 18,
          fontWeight: WEIGHT.body,
          letterSpacing: 18 * TRACK.meta,
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
            justifyContent: "center",
            alignItems: "flex-start",
            width: "100%",
          },
        },
        text(copy.certificateOf, {
          padding: "9px 16px 9px 22px",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 999,
          fontSize: 17,
          fontWeight: WEIGHT.strong,
          letterSpacing: 17 * TRACK.eyebrow,
          color: INK_MUTED,
        }),
        text(item.displayName, {
          marginTop: 24,
          width: "100%",
          fontSize: size,
          fontWeight: WEIGHT.display,
          letterSpacing: size * TRACK.display,
          lineHeight: LEADING.display,
          color: INK,
        }),
        text(item.eventTitle, {
          marginTop: 14,
          width: "100%",
          fontSize: 29,
          fontWeight: WEIGHT.strong,
          letterSpacing: 29 * TRACK.title,
          lineHeight: LEADING.title,
          color: INK,
        }),
      ),
    ),
  );
}

export default ogCardElement;
