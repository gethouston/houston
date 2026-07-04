#!/usr/bin/env node
/**
 * Build the embeddable native-bridge bundle: a single self-contained IIFE at
 * `dist/houston-sdk.bridge.js` exposing the global `HoustonSdkBridge`
 * (`create({ send }) -> { receive, dispose }` + `version`).
 *
 * Target: JavaScriptCore / Hermes (Safari ES2022), NO Node/DOM globals beyond
 * what the host polyfills (timers) and what the bundle self-shims
 * (Headers/Request/AbortController/TextEncoder/TextDecoder — see
 * `src/bridge/shims.ts`). The bundle is fully inlined; the iOS/Android build
 * runs this script, so `dist/` is gitignored and never committed.
 */

import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const outfile = join(pkgRoot, "dist", "houston-sdk.bridge.js");

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [join(pkgRoot, "src", "bridge", "entry.ts")],
  outfile,
  bundle: true,
  format: "iife",
  globalName: "HoustonSdkBridge",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
  // The bundle must assume no ambient Node/DOM host globals. esbuild does not
  // inject any; keeping `define` empty documents that intent.
  define: {},
});

const { size } = await stat(outfile);
const kib = (size / 1024).toFixed(1);
if (result.warnings.length > 0) {
  for (const w of result.warnings) console.warn("[build-bridge]", w.text);
}
console.log(`[build-bridge] wrote ${outfile} (${kib} KiB, ${size} bytes)`);
