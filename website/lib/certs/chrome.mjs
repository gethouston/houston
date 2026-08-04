import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import h from "./h.mjs";
import { HELMET_RATIO, helmetDataUrl } from "./logo.mjs";

/**
 * Shared chrome for the two photographic certificate images.
 *
 * Both the printable certificate and the social card are the same photograph
 * with type laid straight onto it — no cards, no panels. Everything that has to
 * be identical between them lives here: the palette, the font families, the
 * backdrop layers (photo + scrim) and the header lockup.
 *
 * satori implements a SUBSET of flexbox and has no block layout, so every
 * container declares `display:"flex"` with an explicit `flexDirection`, and
 * spacing is explicit margins.
 */

/** Family names as registered in raster.mjs. */
export const BODY_FONT = "Hanken Grotesk";
export const SCRIPT_FONT = "Great Vibes";

/**
 * Warm white on deep navy. The type never uses pure #fff: the photograph is a
 * cool blue, and Houston's warm white keeps the brand's ink on top of it.
 */
export const INK = "#faf9f5";
export const INK_MUTED = "rgba(250, 249, 245, 0.82)";
export const INK_SUBTLE = "rgba(250, 249, 245, 0.66)";
export const HAIRLINE = "rgba(250, 249, 245, 0.28)";
/** The photograph's own darkest sky — the scrim tint and the canvas fallback. */
export const NAVY = "#040c1e";
/** That same navy at an alpha, for scrim stops. */
export const navy = (alpha) => `rgba(4, 12, 30, ${alpha})`;

const BG_FILE = fileURLToPath(
  new URL("./assets/space-bg.jpg", import.meta.url),
);
const BG_BYTES = readFileSync(BG_FILE);

/**
 * Pixel size of a baseline JPEG, from its first frame header.
 *
 * The crop maths below is expressed against the photograph's true aspect ratio
 * rather than a hardcoded pair of numbers, so replacing the art with a
 * differently proportioned shot re-crops correctly instead of stretching it.
 */
function jpegSize(buf) {
  let at = 2; // past the SOI marker
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = buf[at + 1];
    // SOF0..SOF15 carry the frame header; DHT/JPGA/DAC share the range.
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

/** Width / height of the backdrop photograph. */
export const BG_RATIO = BG_SIZE.width / BG_SIZE.height;

/** The photograph as a data URL — read and encoded once for the whole build. */
export const BG_SRC = `data:image/jpeg;base64,${BG_BYTES.toString("base64")}`;

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
export function coverRect(boxW, boxH, focusY = 0.5) {
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
 * The photograph plus its legibility scrim, as the first two children of a
 * `position:relative; overflow:hidden` root.
 *
 * The scrim is a single multi-stop gradient rather than a flat wash: it only
 * has to buy contrast in the bands that carry type, and it must leave the
 * sunrise and the Earth alone — those are the reason the photograph is here.
 *
 * @param {number} width Canvas width.
 * @param {number} height Canvas height.
 * @param {{focusY?: number, scrim: string|string[]}} options
 */
export function backdrop(width, height, { focusY = 0.5, scrim }) {
  const rect = coverRect(width, height, focusY);
  const layers = Array.isArray(scrim) ? scrim : [scrim];
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

/** A line of type. */
export const text = (content, style) =>
  h("div", { style: { display: "flex", ...style } }, content);

/**
 * A line of type that a parent centres.
 *
 * satori adds the tracking after the LAST glyph too, so a centred, tracked line
 * lands letterSpacing/2 to the left of the true axis. Shrink-to-fit lines get a
 * compensating left margin — flex centring splits it evenly, so one full step of
 * margin moves the ink back by half. Full-width lines centre their own text and
 * need no correction.
 */
export const centred = (content, style) => {
  const track = style.width ? 0 : (style.letterSpacing ?? 0);
  return text(content, track ? { marginLeft: track, ...style } : style);
};

/**
 * The issuer lockup: the helmet, the HOUSTON wordmark to its right, and the
 * domain set directly under the wordmark.
 *
 * @param {{helmet: number, word: number, domain: number, centred?: boolean}} sizes
 */
export function lockup({ helmet, word, domain, centred = false }) {
  const track = word * 0.22;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        // Same trailing-tracking correction as `text`, for the lockup as a whole.
        ...(centred ? { marginLeft: track } : {}),
      },
    },
    h("img", {
      src: helmetDataUrl(INK),
      width: Math.round(helmet * HELMET_RATIO),
      height: helmet,
      style: { display: "flex" },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          marginLeft: Math.round(helmet * 0.28),
        },
      },
      text("HOUSTON", {
        fontSize: word,
        fontWeight: 600,
        letterSpacing: track,
        color: INK,
      }),
      text("gethouston.ai", {
        marginTop: Math.round(word * 0.22),
        fontSize: domain,
        fontWeight: 400,
        letterSpacing: domain * 0.06,
        color: INK_SUBTLE,
      }),
    ),
  );
}
