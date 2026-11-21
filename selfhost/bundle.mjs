import { build } from "esbuild";

const externalImport =
  /^@anthropic-ai\/claude-agent-sdk(?:\/|$)|^@silvia-odwyer\/photon-node(?:\/|$)|^@earendil-works\/pi-coding-agent(?:\/|$)|^playwright-core(?:\/|$)|\.node$/;

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
  sourcemap: true,
  sourcesContent: false,
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

{
  const { readFileSync } = await import("node:fs");
  const emitted = readFileSync("dist/runtime/main.mjs", "utf8");
  for (const specifier of [
    "@anthropic-ai/claude-agent-sdk",
    "@earendil-works/pi-coding-agent",
    "playwright-core",
  ]) {
    if (!emitted.includes(`"${specifier}"`)) {
      throw new Error(
        `bundle self-check: ${specifier} was inlined instead of staying external`,
      );
    }
  }
  for (const map of ["dist/host/main.mjs.map", "dist/runtime/main.mjs.map"]) {
    const parsed = JSON.parse(readFileSync(map, "utf8"));
    if (Array.isArray(parsed.sourcesContent)) {
      throw new Error(`bundle self-check: ${map} inlines sourcesContent`);
    }
  }
}
