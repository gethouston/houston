import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";

// The web app is installable (Add to Home Screen / Install app) only while the
// manifest, the icons it points at, and the index.html links all agree. Each
// piece fails silently in the browser (no install prompt, a screenshot for an
// icon), so the contract is pinned here instead.

const publicDir = new URL("../public/", import.meta.url);
const read = (rel: string, base: URL = publicDir) =>
  readFileSync(fileURLToPath(new URL(rel, base)));

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: "any" | "maskable";
}
interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(
  read("manifest.webmanifest").toString("utf8"),
) as Manifest;
const indexHtml = read("../index.html").toString("utf8");

/** Width/height from the PNG IHDR chunk (bytes 16..24 of any valid PNG). */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Smallest alpha value in a PNG's raster (255 for a fully opaque image).
 * Decodes the IDAT stream and reverses the per-row filters; only the 8-bit
 * RGBA layout the icon pipeline (sips) writes is supported.
 */
function minAlpha(png: Buffer): number {
  const { width, height } = pngSize(png);
  const colorType = png.readUInt8(25);
  if (colorType !== 6) return 255; // no alpha channel at all
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString("ascii");
    if (type === "IDAT") idat.push(png.subarray(pos + 8, pos + 8 + length));
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let min = 255;
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + pred) & 255;
    }
    for (let i = 3; i < stride; i += bpp) if (line[i] < min) min = line[i];
    prev = line;
  }
  return min;
}

describe("PWA manifest", () => {
  test("declares an installable standalone app named Houston", () => {
    expect(manifest.name).toBe("Houston");
    expect(manifest.short_name).toBe("Houston");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
  });

  test("splash colours match the pre-JS frame index.html paints", () => {
    // index.html's first frame is #fcfcfc (light `--ht-background`); the
    // splash the OS draws before that frame must not flash a different colour.
    expect(indexHtml).toContain(
      '<meta name="theme-color" content="#fcfcfc" />',
    );
    expect(manifest.background_color).toBe("#fcfcfc");
    expect(manifest.theme_color).toBe("#fcfcfc");
  });

  test("ships 192 and 512 icons for both any and maskable purposes", () => {
    for (const purpose of ["any", "maskable"] as const) {
      const sizes = manifest.icons
        .filter((icon) => icon.purpose === purpose)
        .map((icon) => icon.sizes)
        .sort();
      expect(sizes).toEqual(["192x192", "512x512"]);
    }
  });

  test("every icon exists under public/ at its declared size", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(icon.type).toBe("image/png");
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(read(`.${icon.src}`))).toEqual({ width: w, height: h });
    }
  });

  test("icons are fully opaque (no transparent corners on the launcher)", () => {
    // The artwork sits on a white plate: a maskable shape crop never cuts into
    // the helmet, and Android never draws a black square behind a transparent
    // PNG. Every alpha byte in the decoded raster must be 255.
    for (const icon of manifest.icons) {
      expect(minAlpha(read(`.${icon.src}`))).toBe(255);
    }
  });
});

describe("index.html install links", () => {
  test("links the manifest and the iOS home-screen icon", () => {
    expect(indexHtml).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
    // iOS ignores the manifest icons; this file is the only icon it reads.
    expect(pngSize(read("apple-touch-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });

  test("opens without browser chrome once installed", () => {
    expect(indexHtml).toContain(
      '<meta name="mobile-web-app-capable" content="yes" />',
    );
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
    );
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-title" content="Houston" />',
    );
    // `default` keeps the OS status bar opaque above the page: the safe-area
    // top inset stays 0 in standalone mode, so the top bar never sits under it.
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    );
  });

  test("does not register a service worker", () => {
    // The bundle is served no-cache so each launch runs the current release;
    // a service worker would pin stale chunks against a live host.
    expect(indexHtml).not.toContain("serviceWorker");
  });
});
