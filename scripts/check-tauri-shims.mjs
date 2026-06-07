#!/usr/bin/env node
/**
 * Guards the web build's Tauri composition.
 *
 * packages/web reuses app/src verbatim and redirects every `@tauri-apps/*`
 * import to a browser shim. If app/src starts importing a NEW `@tauri-apps/*`
 * module subpath, or invokes a NEW native command, the web build silently
 * breaks (an unaliased import 404s, or invoke() hits the "desktop-only" default
 * and throws at runtime). This script fails CI the moment that drift appears,
 * so web parity is a conscious decision, never an accident.
 *
 * Checks:
 *   1. Every `@tauri-apps/<specifier>` imported by app/src has a shim alias in
 *      packages/web/vite.config.ts AND a path mapping in tsconfig.json.
 *   2. Every invoke("<cmd>") string reachable from app/src is handled by name
 *      in packages/web/src/shims/tauri-core.ts (explicit case or documented).
 *
 * Run: node scripts/check-tauri-shims.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSrc = join(root, "app", "src");
const webDir = join(root, "packages", "web");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(appSrc);
const allSrc = files.map((f) => readFileSync(f, "utf8"));

// 1. @tauri-apps/* specifiers imported by app/src.
const specifiers = new Set();
const specRe = /from\s+["'](@tauri-apps\/[^"']+)["']|import\(\s*["'](@tauri-apps\/[^"']+)["']\s*\)/g;
for (const src of allSrc) {
  let m;
  while ((m = specRe.exec(src))) specifiers.add(m[1] ?? m[2]);
}

const viteConfig = readFileSync(join(webDir, "vite.config.ts"), "utf8");
const tsconfig = readFileSync(join(webDir, "tsconfig.json"), "utf8");

const errors = [];
for (const spec of specifiers) {
  if (!viteConfig.includes(`"${spec}"`)) {
    errors.push(`vite.config.ts is missing a shim alias for "${spec}"`);
  }
  if (!tsconfig.includes(`"${spec}"`)) {
    errors.push(`tsconfig.json is missing a paths entry for "${spec}"`);
  }
}

// 2. invoke("cmd") commands reachable from app/src.
const commands = new Set();
const cmdRe = /invoke(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/gi;
for (const src of allSrc) {
  let m;
  while ((m = cmdRe.exec(src))) commands.add(m[1]);
}

const shim = readFileSync(
  join(webDir, "src", "shims", "tauri-core.ts"),
  "utf8",
);
// Keychain commands intentionally never run on web (browser storage forced);
// they're covered by the shim's default guard and don't need explicit cases.
const KEYCHAIN_ONLY = new Set(["auth_get_item", "auth_set_item", "auth_remove_item"]);
for (const cmd of commands) {
  if (KEYCHAIN_ONLY.has(cmd)) continue;
  if (!shim.includes(`"${cmd}"`)) {
    errors.push(
      `packages/web/src/shims/tauri-core.ts has no case for invoke("${cmd}")`,
    );
  }
}

if (errors.length) {
  console.error("✗ Tauri web-shim parity check failed:\n");
  for (const e of errors) console.error("  - " + e);
  console.error(
    `\napp/src @tauri-apps specifiers: ${[...specifiers].join(", ")}` +
      `\napp/src invoke commands: ${[...commands].sort().join(", ")}` +
      `\n\nFix: add the missing shim alias / path / invoke case in packages/web ` +
      `(see ${relative(root, webDir)}).`,
  );
  process.exit(1);
}

console.log(
  `✓ Tauri web-shim parity OK — ${specifiers.size} specifiers, ${commands.size} invoke commands all shimmed.`,
);
