#!/usr/bin/env node
// Structural parity gate for the website's translations.
//
// en.js is the source of truth. Every other locale must have the SAME key
// paths, the SAME array lengths at every array node, and the same leaf types,
// so a template written against `t.<path>` can never hit an undefined value in
// one language and a string in another. It also bans the em dash, which the
// house copy rules forbid in user-facing text.
//
// Locales that do not exist yet are skipped with a note, so this passes while
// es.js and pt.js are still being written.
//
// Run: node scripts/check-locales.mjs   (pnpm/npm run check:locales)

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// Walks a locale tree against the base tree, reporting every divergence rather
// than stopping at the first one.
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

// Em dashes are banned in every locale, including the base one.
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
  const mod = await import(`file://${file}`);
  return mod.default;
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
