#!/usr/bin/env node
/**
 * The USAGE half of the locale gate (`check-locales.mjs` owns parity).
 *
 * Walks `app/src` and reports every literal `t("...")` key that NO locale
 * defines. Parity alone could never see those: three skill-surface keys were in
 * sync across all three locales by being absent from all three, and each
 * rendered its own key at the user ("detail.savingChanges" on the save button).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** `ai-hub.json` -> the `aiHub` namespace `t()` calls name. */
const namespaceOf = (file) =>
  file.replace(/\.json$/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase());

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Whether `path` resolves to something in `bundle` — a string, an object (a
 *  `returnObjects` read), or a plural family (`key_one`/`key_other`). */
function defines(bundle, path) {
  const segments = path.split(".");
  let node = bundle;
  for (const segment of segments) {
    if (node === undefined || node === null || typeof node !== "object")
      return false;
    if (segment in node) {
      node = node[segment];
      continue;
    }
    const last = segment === segments[segments.length - 1];
    if (last && Object.keys(node).some((k) => k.startsWith(`${segment}_`)))
      return true;
    return false;
  }
  return node !== undefined;
}

/**
 * Every literal `t("...")` key in one file, resolved to a namespace.
 *
 * A `ns:key` key names its own namespace. A bare key belongs to the file's
 * `useTranslation(...)` namespace (the FIRST one, which is i18next's default
 * for that hook); a file that has none is skipped rather than guessed at, and
 * so is any non-literal key — a computed key is not something this can read.
 */
function usedKeys(source) {
  const hook = /useTranslation\(\s*(?:\[\s*)?"([\w-]+)"/.exec(source);
  const fallback = hook?.[1];
  const keys = [];
  for (const [, key] of source.matchAll(/\bt\(\s*"([^"$]+)"/g)) {
    const [ns, path] = key.includes(":")
      ? key.split(/:(.*)/s)
      : [fallback, key];
    if (ns && path) keys.push({ ns, path, key });
  }
  return keys;
}

/**
 * Keys `t()` asks for that no locale defines.
 *
 * `loadLocale` is passed in rather than imported so the two halves of the gate
 * read locales through ONE loader.
 */
export function usageReport(sourceDir, locales, loadLocale) {
  const bundles = new Map();
  for (const locale of locales)
    for (const [file, content] of Object.entries(loadLocale(locale)))
      bundles.set(`${locale}.${namespaceOf(`${file}.json`)}`, content);
  const known = new Set(
    [...bundles.keys()].map((id) => id.slice(id.indexOf(".") + 1)),
  );
  const missing = [];
  for (const file of sourceFiles(sourceDir)) {
    const source = readFileSync(file, "utf8");
    for (const { ns, path, key } of usedKeys(source)) {
      // A namespace this app does not register is not a translation call at
      // all (a `t()`-shaped helper of someone else's).
      if (!known.has(ns)) continue;
      const defined = locales.some((locale) =>
        defines(bundles.get(`${locale}.${ns}`) ?? {}, path),
      );
      if (!defined)
        missing.push(`${file.slice(sourceDir.length + 1)}: t("${key}")`);
    }
  }
  return missing;
}
