#!/usr/bin/env node
/**
 * Guards the desktop's native boundary, in every direction it can drift.
 *
 * `app/src/lib/desktop-native-commands.ts` declares the ONLY capabilities the
 * frontend may reach outside `@houston/sdk` — the ones that are properties of
 * the user's machine rather than of Houston. That declaration is worth nothing
 * unless three other places agree with it: `app/src/lib/os-bridge/` (the only
 * caller), the Rust `generate_handler!` block (the only implementer), and the
 * web shim (`packages/web` reuses `app/src` verbatim in a browser, where an
 * unhandled command throws at runtime).
 *
 * Six assertions, all fatal:
 *
 *   1. Every `invoke("X")` reachable from `app/src` is declared, and every
 *      declared command is actually invoked (a stale entry rots the list).
 *   2. The declared set and the `app/src-tauri/src/lib.rs` `generate_handler!`
 *      block match exactly: an invoke with no registration throws at runtime,
 *      and a registration with no caller is native code nobody can reach.
 *   3. Every declared command is a `case` label of the dispatch in
 *      `packages/web/src/shims/tauri-core.ts`, or is on the documented
 *      identity-session exemption.
 *   4. No file under `app/src/` outside `app/src/lib/os-bridge/` contains
 *      `invoke(` or imports `invoke` at all.
 *   5. Every `@tauri-apps/<specifier>` imported by `app/src` has a shim alias
 *      in `packages/web/vite.config.ts` AND a path mapping in its tsconfig.
 *   6. `@houston-ai/engine-client` resolves to the ONE adapter entry in both
 *      vite configs and in both tsconfigs that typecheck `app/src`.
 *
 * Run: node scripts/check-desktop-native.mjs   (root script: pnpm check)
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterAliasErrors } from "./desktop-native/adapter-alias.mjs";
import { readSources } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSrc = join(root, "app", "src");
const webDir = join(root, "packages", "web");
// One module per native category, so the trailing separator matters: without
// it the prefix would also excuse `app/src/lib/os-bridge.ts`, the barrel that
// re-exports them and must never invoke anything itself.
const BRIDGE_DIR = join(appSrc, "lib", "os-bridge") + sep;

const files = readSources(appSrc);

const errors = [];

// The declared surface. Parsed rather than imported: this script runs under
// plain node from `pnpm check` and from packages/web's typecheck, neither of
// which carries a TypeScript loader. A parse that dropped entries would fail
// assertion 1 immediately, so there is nothing silent about getting it wrong.
const declaredSource = readFileSync(
  join(appSrc, "lib", "desktop-native-commands.ts"),
  "utf8",
);
const declared = new Map(
  [...declaredSource.matchAll(/\[\s*"([a-z0-9_]+)",\s*"([a-z-]+)",/g)].map(
    (m) => [m[1], m[2]],
  ),
);
if (declared.size === 0)
  errors.push("desktop-native-commands.ts declares no commands (parse failed)");

// 1. What app/src actually invokes, through the typed wrapper or directly.
const invoked = new Set();
const INVOKE_RE = /\binvoke(?:Native)?(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/g;
for (const { src } of files)
  for (const m of src.matchAll(INVOKE_RE)) invoked.add(m[1]);

for (const command of invoked)
  if (!declared.has(command))
    errors.push(
      `invoke("${command}") is not declared in app/src/lib/desktop-native-commands.ts — declare it with a category and a reason, or route the call through @houston/sdk`,
    );
for (const command of declared.keys())
  if (!invoked.has(command))
    errors.push(
      `desktop-native-commands.ts declares "${command}" but nothing in app/src invokes it — delete the entry`,
    );

// 2. The Rust side, in both directions: a call with no registration throws at
// runtime, and a registration with no caller is unreachable native code.
const lib = readFileSync(
  join(root, "app", "src-tauri", "src", "lib.rs"),
  "utf8",
);
const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib);
if (!handler)
  errors.push("app/src-tauri/src/lib.rs has no generate_handler! block");
// One `module::path::command,` per line; anything else in the block is a
// comment, and Rust lifetimes/char literals make a quote-aware strip the wrong
// tool here.
const registered = new Set(
  (handler?.[1] ?? "").split("\n").flatMap((line) => {
    const entry = /^\s*(?:[a-z0-9_]+::)*([a-z0-9_]+)\s*,\s*$/.exec(line);
    return entry ? [entry[1]] : [];
  }),
);
for (const command of declared.keys())
  if (!registered.has(command))
    errors.push(
      `"${command}" is declared native but app/src-tauri/src/lib.rs never registers it — the invoke would throw`,
    );
for (const command of registered)
  if (!declared.has(command))
    errors.push(
      `app/src-tauri/src/lib.rs registers "${command}", which app/src never invokes — delete the command and its generate_handler! entry`,
    );

// 3. The web shim. The identity-session store intentionally never runs on web
// (browser storage is forced there), so these three are covered by the shim's
// default guard and need no case. Named one by one, NOT taken from the
// `keychain` category: recategorising a command must never quietly excuse it
// from being shimmed.
const SHIM_EXEMPT = new Set([
  "auth_get_item",
  "auth_set_item",
  "auth_remove_item",
]);
const shim = readFileSync(
  join(webDir, "src", "shims", "tauri-core.ts"),
  "utf8",
);
// The `case` labels of the shim's `switch (cmd)`, not the file's text: a
// command named in a comment (or in the error copy) is documentation, not a
// handler, and would otherwise pass this assertion while throwing on web.
const shimmed = new Set(
  [...shim.matchAll(/^\s*case\s+"([a-z0-9_]+)"\s*:/gm)].map((m) => m[1]),
);
for (const command of declared.keys())
  if (!SHIM_EXEMPT.has(command) && !shimmed.has(command))
    errors.push(
      `packages/web/src/shims/tauri-core.ts has no case for invoke("${command}")`,
    );

// 4. The invariant the bridge states: it is the only caller. Both the call and
// the IMPORT are checked, because `import { invoke as run }` would make the
// call spelling anything at all.
const CORE_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["']@tauri-apps\/api\/core["']/g;
for (const { path, src } of files) {
  if (path.startsWith(BRIDGE_DIR)) continue;
  const where = relative(root, path);
  if (/\binvoke(?:<[^>]*>)?\(/.test(src))
    errors.push(
      `${where} calls invoke( — only app/src/lib/os-bridge/ may; add an os* wrapper to the matching category module there and import it from "os-bridge"`,
    );
  for (const m of src.matchAll(CORE_IMPORT))
    if (/\binvoke\b/.test(m[1]))
      errors.push(
        `${where} imports invoke from @tauri-apps/api/core — only app/src/lib/os-bridge/invoke.ts may hold it`,
      );
}

// 5. The @tauri-apps module subpaths the web build has to alias.
const specifiers = new Set();
const SPEC_RE =
  /from\s+["'](@tauri-apps\/[^"']+)["']|import\(\s*["'](@tauri-apps\/[^"']+)["']\s*\)/g;
for (const { src } of files)
  for (const m of src.matchAll(SPEC_RE)) specifiers.add(m[1] ?? m[2]);

const viteConfig = readFileSync(join(webDir, "vite.config.ts"), "utf8");
const tsconfig = readFileSync(join(webDir, "tsconfig.json"), "utf8");
for (const spec of specifiers) {
  if (!viteConfig.includes(`"${spec}"`))
    errors.push(
      `packages/web/vite.config.ts is missing a shim alias for "${spec}"`,
    );
  if (!tsconfig.includes(`"${spec}"`))
    errors.push(
      `packages/web/tsconfig.json is missing a paths entry for "${spec}"`,
    );
}

// 6. The engine-client specifier: a name, not a package, so the build and the
// typecheck only agree because four configs say the same thing.
errors.push(...adapterAliasErrors(root));

if (errors.length) {
  console.error("✗ Desktop native boundary check FAILED:\n");
  for (const e of errors.sort()) console.error(`  - ${e}`);
  console.error(
    "\nThe rule: app/src may leave @houston/sdk only for a capability of the " +
      "user's MACHINE, declared in app/src/lib/desktop-native-commands.ts and " +
      "invoked only from app/src/lib/os-bridge/.\n",
  );
  process.exit(1);
}

const byCategory = [...new Set(declared.values())]
  .sort()
  .map((c) => `${c} ${[...declared.values()].filter((x) => x === c).length}`)
  .join(", ");
console.log(
  `✓ Desktop native boundary OK — ${declared.size} commands (${byCategory}); ` +
    `${registered.size} registered in lib.rs; ` +
    `${specifiers.size} @tauri-apps specifiers shimmed.`,
);
