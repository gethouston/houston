import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The Houston helmet glyph, as a data-URL <img> source for satori.
 *
 * satori does not rasterise inline <svg> children, so the mark ships as an
 * `<img src="data:image/svg+xml;base64,…">`. The art is read from the site's
 * own logo partial (`src/_includes/houston-logo.njk`) so the certificate and
 * the website can never drift apart — that partial stays the single source of
 * truth for the helmet path data.
 */
const LOGO_NJK = fileURLToPath(
  new URL("../../src/_includes/houston-logo.njk", import.meta.url),
);

/** viewBox + path markup, parsed once from the partial. */
const art = (() => {
  const njk = readFileSync(LOGO_NJK, "utf8");
  const svg = njk.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/);
  if (!svg) throw new Error(`[certificates] no <svg> found in ${LOGO_NJK}`);
  const viewBox = svg[1].match(/viewBox="([^"]+)"/);
  if (!viewBox) throw new Error(`[certificates] no viewBox in ${LOGO_NJK}`);
  const [, , w, hh] = viewBox[1].split(/\s+/).map(Number);
  // The partial's width/height are Nunjucks placeholders ({{ size }}), so the
  // tag is rebuilt from the viewBox rather than reused verbatim.
  return { viewBox: viewBox[1], ratio: w / hh, inner: svg[2] };
})();

/** Aspect ratio (width / height) of the helmet glyph. */
export const HELMET_RATIO = art.ratio;

/** Helmet as a base64 SVG data URL, filled with `color`. */
export function helmetDataUrl(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}" fill="${color}">${art.inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
