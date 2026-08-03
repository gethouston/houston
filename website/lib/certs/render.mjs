import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCertificates } from "./fetch.mjs";
import { uncoveredCharacters } from "./font-coverage.mjs";
import {
  itemDigest,
  readImageManifest,
  rendererFingerprint,
  writeImageManifest,
} from "./image-cache.mjs";
import { loadFontCoverage, loadFonts, renderItemImages } from "./raster.mjs";

// Build-time certificate images, written by the `eleventy.after` hook.
//
// Per attendee: `_site/c/<CODE>.png` (the 2000x1414 printable certificate) and
// `_site/c/<CODE>.og.png` (the 1200x630 social card). An image is re-rendered
// whenever the attendee's data or the renderer itself changed since the last
// build (see image-cache.mjs) — existence alone is NOT enough, or a corrected
// name would show on the page and never on the certificate. `CERT_IMAGES=force`
// re-renders unconditionally.

/** Images rendered at once. Each one is a satori + resvg pass on a big canvas. */
const CONCURRENCY = 4;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Render every issued certificate into `<outputDir>/c/`.
 *
 * Never throws: neither a certificate that fails to render nor a failure to set
 * the renderer up may take the site build down with it (the share pages still
 * ship; they just have no image).
 *
 * @param {string} outputDir Eleventy's output dir (`dir.output`, e.g. `_site`).
 */
export async function renderAllCertificates(outputDir) {
  const { items } = await loadCertificates();
  if (items.length === 0) {
    console.log("[certificates] 0 certificate images to render.");
    return;
  }

  let setup;
  try {
    setup = await prepare(outputDir);
  } catch (err) {
    console.warn(
      `[certificates] image rendering is unavailable: ${err.message}; the site ships without certificate images.`,
    );
    return;
  }

  const { dir, fonts, coverage, fingerprint, manifest } = setup;
  const force = process.env.CERT_IMAGES === "force";
  const started = Date.now();
  const counts = { rendered: 0, skipped: 0, failed: 0 };
  /** Digests of the images actually present when this build ends. */
  const fresh = {};

  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      const certPath = join(dir, `${item.code}.png`);
      const ogPath = join(dir, `${item.code}.og.png`);
      const digest = itemDigest(item, fingerprint);

      if (
        !force &&
        manifest[item.code] === digest &&
        (await exists(certPath)) &&
        (await exists(ogPath))
      ) {
        fresh[item.code] = digest;
        counts.skipped += 1;
        continue;
      }

      warnAboutMissingGlyphs(item, coverage);

      try {
        const { cert, og } = await renderItemImages(item, fonts);
        await writeFile(certPath, cert);
        await writeFile(ogPath, og);
        fresh[item.code] = digest;
        counts.rendered += 1;
      } catch (err) {
        counts.failed += 1;
        console.warn(
          `[certificates] ${item.code}: image render failed: ${err.message}`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  await writeImageManifest(fresh);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[certificates] ${counts.rendered} rendered, ${counts.skipped} cached, ${counts.failed} failed in ${seconds}s.`,
  );
}

/** Everything the render loop needs. Throws; the caller turns that into a warn. */
async function prepare(outputDir) {
  const dir = join(outputDir, "c");
  await mkdir(dir, { recursive: true });
  const [fonts, coverage, fingerprint, manifest] = await Promise.all([
    loadFonts(),
    loadFontCoverage(),
    rendererFingerprint(),
    readImageManifest(),
  ]);
  return { dir, fonts, coverage, fingerprint, manifest };
}

/**
 * Say so, loudly, when a certificate is about to be drawn with empty boxes.
 *
 * The bundled fonts are Latin cuts and satori substitutes `.notdef` for
 * anything else without a word. The image is a permanent public credential, so
 * a build that produces boxes has to be visible in the log rather than
 * discovered by the attendee.
 */
function warnAboutMissingGlyphs(item, coverage) {
  const text = [
    item.displayName,
    item.eventTitle,
    item.eventTagline,
    item.eventDateDisplay,
    item.location,
  ]
    .filter(Boolean)
    .join(" ");
  const missing = uncoveredCharacters(text, coverage);
  if (missing.length === 0) return;
  console.warn(
    `[certificates] ${item.code}: the bundled fonts cannot draw ${missing.join(" ")} — ` +
      `"${item.displayName}" will render as empty boxes. Add a font covering that script before issuing it.`,
  );
}
