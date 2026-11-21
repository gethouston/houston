#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
