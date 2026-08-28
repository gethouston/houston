import { build } from "esbuild";

// Externalize ONLY what genuinely cannot live inside the bundle. Everything
// else is inlined: a worker VM boot used to spend 7-10s of its ~15s start in
// Node module RESOLUTION (getPackageScopeConfig/internalModuleStat walks over
// the Kata guest filesystem, profiled 2026-08-27) because every npm import
// stayed external. The same code as one self-contained file evaluates in
// ~0.3s.
//  - @anthropic-ai/claude-agent-sdk: lazily imported, and it spawns the
//    `claude` subprocess from its own package directory — bundling would
//    break that file layout. Cloud never reaches it (Anthropic is OFF there);
//    selfhost resolves it from node_modules as before.
//  - @silvia-odwyer/photon-node: pi's image-resize wasm host locates
//    photon_rs_bg.wasm with __dirname — bundled, that resolves nowhere and
//    every image an agent reads silently degrades to "[Image omitted…]".
//    Lazily imported; resolves from the image's node_modules.
//  - @earendil-works/pi-coding-agent: its provider registry lazy-loads
//    per-provider auth/stream chunks with a RUNTIME-COMPUTED relative
//    import specifier esbuild cannot rewrite. Inlined, that import resolves
//    beside the bundle ("/app/dist/runtime/openai-codex.js") and every pi
//    OAuth derivation for a chunked provider dies at turn time. External,
//    pi resolves its own chunks from its package directory as designed.
//  - *.node native addons load via the filesystem by design.
const externalImport =
  /^@anthropic-ai\/claude-agent-sdk(?:\/|$)|^@silvia-odwyer\/photon-node(?:\/|$)|^@earendil-works\/pi-coding-agent(?:\/|$)|\.node$/;

const externalNodeModules = {
  name: "external-unbundleables",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!externalImport.test(args.path)) return undefined;
      return { path: args.path, external: true };
    });
  },
};

const banner = {
  js: 'import { createRequire as __houstonCreateRequire } from "node:module"; const require = __houstonCreateRequire(import.meta.url);',
};

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  banner,
  plugins: [externalNodeModules],
  logLevel: "info",
  // External .map next to each bundle; node runs with --enable-source-maps
  // (see the Dockerfile) so stack traces — and the Sentry events built from
  // them — point at the original TS files instead of bundle offsets.
  sourcemap: true,
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["packages/host/src/local/main.ts"],
    outfile: "dist/host/main.mjs",
  }),
  build({
    ...shared,
    entryPoints: ["packages/runtime/src/main.ts"],
    outfile: "dist/runtime/main.mjs",
  }),
]);

// Self-check: the deliberate externals must survive as import specifiers in
// the emitted runtime bundle. If a refactor inlines one, image reads (photon
// wasm) or the Anthropic backend (SDK subprocess layout) break SILENTLY at
// turn time — nothing a boot probe can see — so fail the build instead.
{
  const { readFileSync } = await import("node:fs");
  const emitted = readFileSync("dist/runtime/main.mjs", "utf8");
  // photon-node is no longer asserted here: it is imported only from within
  // pi, which is itself external — its specifier lives in pi's package files,
  // not this bundle. The resolve filter above still forces it external if any
  // bundled module ever imports it directly.
  for (const specifier of [
    "@anthropic-ai/claude-agent-sdk",
    "@earendil-works/pi-coding-agent",
  ]) {
    if (!emitted.includes(`"${specifier}"`)) {
      throw new Error(
        `bundle self-check: ${specifier} was inlined instead of staying external`,
      );
    }
  }
}
