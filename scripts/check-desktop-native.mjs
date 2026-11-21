#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readSources } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSrc = join(root, "app", "src");
const webDir = join(root, "packages", "web");
const BRIDGE_DIR = join(appSrc, "lib", "os-bridge") + sep;

const files = readSources(appSrc);

const errors = [];

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

const lib = readFileSync(
  join(root, "app", "src-tauri", "src", "lib.rs"),
  "utf8",
);
const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib);
if (!handler)
  errors.push("app/src-tauri/src/lib.rs has no generate_handler! block");
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

const SHIM_EXEMPT = new Set([
  "auth_get_item",
  "auth_set_item",
  "auth_remove_item",
]);
const shim = readFileSync(
  join(webDir, "src", "shims", "tauri-core.ts"),
  "utf8",
);
const shimmed = new Set(
  [...shim.matchAll(/^\s*case\s+"([a-z0-9_]+)"\s*:/gm)].map((m) => m[1]),
);
for (const command of declared.keys())
  if (!SHIM_EXEMPT.has(command) && !shimmed.has(command))
    errors.push(
      `packages/web/src/shims/tauri-core.ts has no case for invoke("${command}")`,
    );

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
