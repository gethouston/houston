/**
 * The `@houston-ai/engine-client` alias invariant.
 *
 * The specifier IS the v3 host adapter: it is not a published package the app
 * resolves from `node_modules`, it is a name four configs redirect to ONE file.
 * Two of them are build-time (`resolve.alias` in each vite config) and two are
 * typecheck-time (`compilerOptions.paths` in each tsconfig that covers
 * `app/src`). Nothing makes them agree on its own, and disagreement is silent
 * in the worst direction: a tsconfig pointing somewhere else typechecks the
 * app against a surface the bundle does not ship, so the build stays green and
 * the app breaks at runtime.
 *
 * The four files are listed EXPLICITLY rather than globbed. A config that stops
 * covering `app/src` should drop off this list by someone deciding so, not by a
 * glob quietly missing it.
 */

import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SPECIFIER = "@houston-ai/engine-client";

/** The one file every mapping must land on, relative to the repo root. */
const ADAPTER_ENTRY = "packages/web/src/engine-adapter/index.ts";

/**
 * `vite` — `{ find: "<spec>", replacement: path.resolve(__dirname, "<target>") }`.
 * `tsconfig` — `"<spec>": ["<target>"]`.
 * Both targets resolve against their own config's directory.
 */
const PATTERNS = {
  vite: new RegExp(
    `find:\\s*["']${SPECIFIER}["']\\s*,\\s*replacement:\\s*path\\.resolve\\(\\s*__dirname\\s*,\\s*["']([^"']+)["']`,
  ),
  tsconfig: new RegExp(`["']${SPECIFIER}["']\\s*:\\s*\\[\\s*["']([^"']+)["']`),
};

const SOURCES = [
  { file: "app/vite.config.ts", kind: "vite" },
  { file: "packages/web/vite.config.ts", kind: "vite" },
  // The two tsconfigs that typecheck `app/src`: the desktop app's own, and
  // packages/web's, which pulls the same sources in through `@houston/app/*`.
  { file: "app/tsconfig.json", kind: "tsconfig" },
  { file: "packages/web/tsconfig.json", kind: "tsconfig" },
];

/**
 * Every way the four mappings can disagree, as reader-facing messages. Empty
 * means all four resolve to {@link ADAPTER_ENTRY}.
 */
export function adapterAliasErrors(root) {
  const want = resolve(root, ADAPTER_ENTRY);
  const errors = [];
  for (const { file, kind } of SOURCES) {
    const path = join(root, file);
    const found = PATTERNS[kind].exec(readFileSync(path, "utf8"));
    if (!found) {
      errors.push(
        `${file} has no ${kind === "vite" ? "resolve.alias entry" : "paths entry"} for "${SPECIFIER}" — it must map to ${ADAPTER_ENTRY}`,
      );
      continue;
    }
    const got = resolve(dirname(path), found[1]);
    if (got !== want)
      errors.push(
        `${file} maps "${SPECIFIER}" to ${relative(root, got)}, not ${ADAPTER_ENTRY} — the build and the typecheck must resolve the same file`,
      );
  }
  return errors;
}

export { ADAPTER_ENTRY, SPECIFIER };
