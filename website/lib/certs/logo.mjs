import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LOGO_NJK = fileURLToPath(
  new URL("../../src/_includes/houston-logo.njk", import.meta.url),
);

const art = (() => {
  const njk = readFileSync(LOGO_NJK, "utf8");
  const svg = njk.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/);
  if (!svg) throw new Error(`[certificates] no <svg> found in ${LOGO_NJK}`);
  const viewBox = svg[1].match(/viewBox="([^"]+)"/);
  if (!viewBox) throw new Error(`[certificates] no viewBox in ${LOGO_NJK}`);
  const [, , w, hh] = viewBox[1].split(/\s+/).map(Number);
  return { viewBox: viewBox[1], ratio: w / hh, inner: svg[2] };
})();

export const HELMET_RATIO = art.ratio;

export function helmetDataUrl(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}" fill="${color}">${art.inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
