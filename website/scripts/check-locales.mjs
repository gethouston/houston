#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_TREES } from "../lib/page-trees.js";

const here = dirname(fileURLToPath(import.meta.url));
const i18nDir = resolve(here, "../src/_data/i18n");

const BASE = "en";
const LOCALES = ["en", "es", "pt"];
const EM_DASH = "—";

const errors = [];
const fail = (locale, path, message) =>
  errors.push(`[${locale}] ${path}: ${message}`);

const kindOf = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
};

const compare = (locale, path, base, actual) => {
  const baseKind = kindOf(base);
  const actualKind = kindOf(actual);

  if (baseKind !== actualKind) {
    fail(locale, path, `expected ${baseKind}, found ${actualKind}`);
    return;
  }

  if (baseKind === "array") {
    if (base.length !== actual.length) {
      fail(
        locale,
        path,
        `array length ${actual.length}, expected ${base.length}`,
      );
      return;
    }
    base.forEach((item, index) => {
      compare(locale, `${path}[${index}]`, item, actual[index]);
    });
    return;
  }

  if (baseKind === "object") {
    for (const key of Object.keys(base)) {
      if (!(key in actual)) {
        fail(locale, `${path}.${key}`, "missing");
        continue;
      }
      compare(locale, `${path}.${key}`, base[key], actual[key]);
    }
    for (const key of Object.keys(actual)) {
      if (!(key in base)) fail(locale, `${path}.${key}`, "not in en");
    }
  }
};

const checkDashes = (locale, path, value) => {
  if (typeof value === "string") {
    if (value.includes(EM_DASH)) fail(locale, path, "contains an em dash");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      checkDashes(locale, `${path}[${index}]`, item);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      checkDashes(locale, `${path}.${key}`, value[key]);
    }
  }
};

const load = async (locale) => {
  const file = resolve(i18nDir, `${locale}.js`);
  if (!existsSync(file)) return null;
  const tree = { ...(await import(`file://${file}`)).default };
  for (const page of PAGE_TREES) {
    const file = resolve(i18nDir, page, `${locale}.js`);
    if (existsSync(file)) tree[page] = (await import(`file://${file}`)).default;
  }
  return tree;
};

const base = await load(BASE);
if (!base) {
  console.error(`Missing base locale: src/_data/i18n/${BASE}.js`);
  process.exit(1);
}

let checked = 0;
for (const locale of LOCALES) {
  const tree = locale === BASE ? base : await load(locale);
  if (!tree) {
    console.log(`locale ${locale} missing, skipped`);
    continue;
  }
  checked++;
  checkDashes(locale, "", tree);
  if (locale !== BASE) compare(locale, "", base, tree);
}

if (errors.length) {
  console.error(`\n${errors.length} locale problem(s):\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error("");
  process.exit(1);
}

console.log(`Locales OK (${checked} checked).`);
