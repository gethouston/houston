import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import h from "./h.mjs";

const BG_FILE = fileURLToPath(
  new URL("./assets/space-bg.jpg", import.meta.url),
);
const BG_BYTES = readFileSync(BG_FILE);

function jpegSize(buf) {
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = buf[at + 1];
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      return {
        width: buf.readUInt16BE(at + 7),
        height: buf.readUInt16BE(at + 5),
      };
    }
    at += 2 + buf.readUInt16BE(at + 2);
  }
  throw new Error(`[certificates] no JPEG frame header in ${BG_FILE}`);
}

const BG_SIZE = jpegSize(BG_BYTES);

const BG_RATIO = BG_SIZE.width / BG_SIZE.height;

const BG_SRC = `data:image/jpeg;base64,${BG_BYTES.toString("base64")}`;

/**
 * Where to draw the photograph so it covers `boxW x boxH` with no letterboxing.
 *
 * `objectFit` in satori gives no control over WHICH part of an off-ratio canvas
 * survives, and this photograph has one subject that must survive: the sunrise
 * on the horizon. So the crop is computed here and applied as an oversized
 * absolutely-positioned <img> inside an overflow-hidden root.
 *
 * @param {number} boxW Canvas width.
 * @param {number} boxH Canvas height.
 * @param {number} focusY 0 keeps the top of the photo, 1 the bottom, 0.5 centres.
 */
function coverRect(boxW, boxH, focusY = 0.5) {
  let width = boxW;
  let height = Math.round(boxW / BG_RATIO);
  if (height < boxH) {
    height = boxH;
    width = Math.round(boxH * BG_RATIO);
  }
  return {
    left: Math.round((boxW - width) / 2),
    top: Math.round((boxH - height) * focusY),
    width,
    height,
  };
}

/**
 * The photograph, and optionally a wash over it, as the first children of a
 * `position:relative; overflow:hidden` root.
 *
 * Contrast is the glass panel's job now (panel.mjs), so the wash is a whisper —
 * a vignette that stops the frame's own corners from clipping, nothing more.
 * Passing no `scrim` at all is legal and leaves the photograph untouched.
 *
 * @param {number} width Canvas width.
 * @param {number} height Canvas height.
 * @param {{focusY?: number, scrim?: string|string[]}} options
 */
export function backdrop(width, height, { focusY = 0.5, scrim } = {}) {
  const rect = coverRect(width, height, focusY);
  const layers = scrim ? (Array.isArray(scrim) ? scrim : [scrim]) : [];
  return [
    h("img", {
      src: BG_SRC,
      width: rect.width,
      height: rect.height,
      style: { display: "flex", position: "absolute", ...rect },
    }),
    ...layers.map((gradient) =>
      h("div", {
        style: {
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          backgroundImage: gradient,
        },
      }),
    ),
  ];
}
