#!/usr/bin/env node
/**
 * Locale parity validator.
 *
 * Compares every non-English locale against English to catch structural
 * drift — missing keys, extra keys, or mismatched leaf types (string vs
 * object). Also bans em dashes in user-facing copy per product preference.
 *
 * Exit 0 = clean, 1 = problems (with a human-readable report).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "locales",
);
const REFERENCE = "en";
const EM_DASH = "\u2014";

function loadLocale(locale) {
  const dir = join(ROOT, locale);
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    out[ns] = JSON.parse(readFileSync(join(dir, file), "utf8"));
  }
  return out;
}

function shape(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function walk(ref, cand, pathPrefix, report) {
  const refShape = shape(ref);
  const candShape = shape(cand);
  if (refShape !== candShape) {
    report.mismatches.push(
      `${pathPrefix}: expected ${refShape}, got ${candShape}`,
    );
    return;
  }
  if (refShape === "object") {
    const refKeys = new Set(Object.keys(ref));
    const candKeys = new Set(Object.keys(cand));
    for (const key of refKeys) {
      if (!candKeys.has(key)) {
        report.missing.push(`${pathPrefix}.${key}`);
        continue;
      }
      walk(ref[key], cand[key], `${pathPrefix}.${key}`, report);
    }
    for (const key of candKeys) {
      if (!refKeys.has(key)) report.extra.push(`${pathPrefix}.${key}`);
    }
  } else if (refShape === "array") {
    if (ref.length !== cand.length) {
      report.mismatches.push(
        `${pathPrefix}: expected length ${ref.length}, got ${cand.length}`,
      );
      return;
    }
    for (let i = 0; i < ref.length; i += 1) {
      walk(ref[i], cand[i], `${pathPrefix}[${i}]`, report);
    }
  } else if (refShape === "string") {
    // Placeholder parity: {{name}} style vars must appear in both locales.
    const refVars = [...ref.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const candVars = [...cand.matchAll(/\{\{(\w+)\}\}/g)]
      .map((m) => m[1])
      .sort();
    if (refVars.join(",") !== candVars.join(",")) {
      report.placeholders.push(
        `${pathPrefix}: en has [${refVars.join(", ")}], this has [${candVars.join(", ")}]`,
      );
    }
    if (cand.includes(EM_DASH)) {
      report.emDashes.push(`${pathPrefix}: contains em dash`);
    }
  }
}

function validate() {
  const locales = readdirSync(ROOT).filter((name) => !name.startsWith("."));
  if (!locales.includes(REFERENCE)) {
    console.error(`Reference locale "${REFERENCE}" not found in ${ROOT}`);
    process.exit(2);
  }
  const reference = loadLocale(REFERENCE);

  // English can't have em dashes either — scan the reference itself.
  const referenceReport = {
    missing: [],
    extra: [],
    mismatches: [],
    placeholders: [],
    emDashes: [],
  };
  walk(reference, reference, "en", referenceReport);

  let failed = referenceReport.emDashes.length > 0;
  if (failed) {
    console.error(`\n[en] em-dash violations:`);
    for (const item of referenceReport.emDashes) console.error(`  ${item}`);
  }

  for (const locale of locales) {
    if (locale === REFERENCE) continue;
    const cand = loadLocale(locale);
    const refNamespaces = new Set(Object.keys(reference));
    const candNamespaces = new Set(Object.keys(cand));
    const report = {
      missing: [],
      extra: [],
      mismatches: [],
      placeholders: [],
      emDashes: [],
    };

    for (const ns of refNamespaces) {
      if (!candNamespaces.has(ns)) {
        report.missing.push(`${ns}.json (entire file missing)`);
        continue;
      }
      walk(reference[ns], cand[ns], ns, report);
    }
    for (const ns of candNamespaces) {
      if (!refNamespaces.has(ns))
        report.extra.push(`${ns}.json (not in reference)`);
    }

    const hasIssues =
      report.missing.length ||
      report.extra.length ||
      report.mismatches.length ||
      report.placeholders.length ||
      report.emDashes.length;
    if (!hasIssues) {
      console.log(`[${locale}] OK (${Object.keys(cand).length} namespaces)`);
      continue;
    }
    failed = true;
    console.error(`\n[${locale}] divergence from ${REFERENCE}:`);
    for (const item of report.missing) console.error(`  MISSING  ${item}`);
    for (const item of report.extra) console.error(`  EXTRA    ${item}`);
    for (const item of report.mismatches) console.error(`  SHAPE    ${item}`);
    for (const item of report.placeholders) console.error(`  VARS     ${item}`);
    for (const item of report.emDashes) console.error(`  EM-DASH  ${item}`);
  }

  if (failed) {
    console.error("\nLocale validation failed.");
    process.exit(1);
  }
  console.log("\nAll locales in sync.");
}

validate();
