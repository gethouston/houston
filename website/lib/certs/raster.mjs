import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { BRAND_FONT, FALLBACK_FONT } from "./chrome.mjs";
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
// General Sans is the site's own typeface — the wordmark's face, loaded from
// Fontshare by `src/_includes/base.njk` — so it is the certificate's face too.
// satori reads TTF/OTF/WOFF and not the woff2 the browser gets, so the four
// weights ship here as the `.ttf` sources the same Fontshare stylesheet lists
// (LICENCE-GeneralSans.txt records the exact URLs).
//
// Hanken Grotesk stays registered behind it as a FALLBACK family, not as a
// role: General Sans is Latin-only and Hanken's cuts carry ~190 code points it
// does not (Vietnamese, mostly). satori falls through the `fonts` array for a
// glyph the first family cannot draw, so an accented name that would otherwise
// be empty boxes still renders — see `loadFontCoverage`.
//
// satori embeds the glyphs as paths, so resvg needs no system fonts — the
// output is identical on macOS and on the ubuntu-latest CI runner.

const FONT_DIR = new URL("./fonts/", import.meta.url);

const FONT_FILES = [
  { file: "GeneralSans-Regular.ttf", name: BRAND_FONT, weight: 400 },
  { file: "GeneralSans-Medium.ttf", name: BRAND_FONT, weight: 500 },
  { file: "GeneralSans-Semibold.ttf", name: BRAND_FONT, weight: 600 },
  { file: "GeneralSans-Bold.ttf", name: BRAND_FONT, weight: 700 },
  { file: "HankenGrotesk-Regular.ttf", name: FALLBACK_FONT, weight: 400 },
  { file: "HankenGrotesk-SemiBold.ttf", name: FALLBACK_FONT, weight: 600 },
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
 * Every code point the certificate can actually draw.
 *
 * The union across ALL registered files, which is the honest answer now that
 * every one of them is reachable: satori resolves a glyph against the whole
 * `fonts` array, so a character Hanken carries and General Sans does not still
 * lands on the page rather than as `.notdef`. Callers use this to refuse to
 * ship a name as empty boxes — satori substitutes silently and would otherwise
 * do exactly that.
 *
 * @returns {Promise<Set<number>>}
 */
export function loadFontCoverage() {
  coveragePending ??= loadFonts().then((fonts) => {
    const covered = new Set();
    for (const font of fonts) {
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
