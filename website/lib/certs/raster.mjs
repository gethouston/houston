import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { BODY_FONT } from "./chrome.mjs";
import { coveredCodePoints } from "./font-coverage.mjs";
import { qrDataUrl } from "./qr.mjs";
import {
  CERT_HEIGHT,
  CERT_WIDTH,
  certificateElement,
} from "./template-cert.mjs";
import { OG_HEIGHT, OG_WIDTH, ogCardElement } from "./template-og.mjs";

// Rasterisation: satori (element tree -> SVG) then resvg (SVG -> PNG).
//
// satori cannot read the site's variable woff2, so the three weights ship here
// as static TTF instances cut from the upstream variable font with fonttools
// (fonts/README-less by design: OFL.txt sits beside them). satori embeds the
// glyphs as paths, so resvg needs no system fonts — the output is identical on
// macOS and on the ubuntu-latest CI runner.

const FONT_DIR = new URL("./fonts/", import.meta.url);

const FONT_FILES = [
  { file: "HankenGrotesk-Light.ttf", name: BODY_FONT, weight: 300 },
  { file: "HankenGrotesk-Regular.ttf", name: BODY_FONT, weight: 400 },
  { file: "HankenGrotesk-SemiBold.ttf", name: BODY_FONT, weight: 600 },
];

/** Memoized so a whole build reads the font files exactly once. */
let fontsPending = null;

export function loadFonts() {
  fontsPending ??= Promise.all(
    FONT_FILES.map(async ({ file, name, weight }) => ({
      name,
      data: await readFile(fileURLToPath(new URL(file, FONT_DIR))),
      weight,
      style: "normal",
    })),
  );
  return fontsPending;
}

/** Memoized union of what the loaded fonts can draw. */
let coveragePending = null;

/**
 * Every code point the BODY family can render.
 *
 * Its three files are Latin cuts of one family, so their union is the real
 * coverage. Callers use it to refuse to ship a name as empty boxes — satori
 * substitutes `.notdef` silently and would otherwise do exactly that. The
 * script face is left out on purpose: it never draws attendee text, so counting
 * it would let a character it happens to carry pass the check and then render
 * as a box in the body face.
 *
 * @returns {Promise<Set<number>>}
 */
export function loadFontCoverage() {
  coveragePending ??= loadFonts().then((fonts) => {
    const covered = new Set();
    for (const font of fonts) {
      if (font.name !== BODY_FONT) continue;
      for (const cp of coveredCodePoints(font.data)) covered.add(cp);
    }
    return covered;
  });
  return coveragePending;
}

async function toPng(element, width, height, fonts) {
  const svg = await satori(element, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}

/**
 * Render one attendee's two images.
 *
 * @returns {Promise<{cert: Buffer, og: Buffer}>}
 */
export async function renderItemImages(item, fonts) {
  const resolved = fonts ?? (await loadFonts());
  const qrSrc = await qrDataUrl(item.pageUrl);
  const [cert, og] = await Promise.all([
    toPng(certificateElement(item, qrSrc), CERT_WIDTH, CERT_HEIGHT, resolved),
    toPng(ogCardElement(item), OG_WIDTH, OG_HEIGHT, resolved),
  ]);
  return { cert, og };
}
