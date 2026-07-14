import { build } from "esbuild";

const workspaceImport = /^(?:@houston\/|@houston-ai\/agent-schemas(?:\/|$))/;

function shouldExternalize(path) {
  if (
    path.startsWith(".") ||
    path.startsWith("/") ||
    workspaceImport.test(path)
  )
    return false;
  return true;
}

const externalNodeModules = {
  name: "external-node-modules",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!shouldExternalize(args.path)) return undefined;
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
