#!/usr/bin/env node
/**
 * ActivityStatus drift detector.
 *
 * Three sources of truth must stay in sync:
 *   1. Rust enum   — engine/houston-engine-core/src/agents/status.rs
 *   2. JSON schema — ui/agent-schemas/src/activity.schema.json
 *   3. TS union    — app/src/data/activity.ts
 *
 * Drift example that prompted this check: `Cancelled` lived in the Rust
 * enum but was missing from both the schema and the TS union, so the
 * board column mapping referenced a status the schema rejected.
 *
 * Exit 0 = aligned, 1 = drift (with a human-readable report).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUST = join(ROOT, "engine/houston-engine-core/src/agents/status.rs");
const SCHEMA = join(ROOT, "ui/agent-schemas/src/activity.schema.json");
const TS = join(ROOT, "app/src/data/activity.ts");

const SNAKE = (pascal) => pascal.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`));

function parseRust() {
  const src = readFileSync(RUST, "utf8");
  // The enum body looks like `pub enum ActivityStatus { Queued, Running, ... }`
  // with doc comments and `#[serde(...)]` interleaved. Strip those, then take
  // every PascalCase identifier between `enum ActivityStatus {` and the
  // matching `}`.
  const start = src.indexOf("pub enum ActivityStatus");
  if (start === -1) throw new Error("ActivityStatus enum not found in status.rs");
  const open = src.indexOf("{", start);
  const close = src.indexOf("}", open);
  const body = src.slice(open + 1, close);
  const stripped = body
    .replace(/\/\/[^\n]*/g, "") // line comments
    .replace(/#\[[^\]]*\]/g, "") // attributes
    .replace(/\s+/g, " ");
  const out = new Set();
  for (const variant of stripped.split(",")) {
    const m = variant.trim().match(/^([A-Z][A-Za-z0-9]*)/);
    if (m) out.add(SNAKE(m[1]));
  }
  return out;
}

function parseSchema() {
  const json = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const arr = json?.items?.properties?.status?.enum;
  if (!Array.isArray(arr)) throw new Error("status.enum not found in activity.schema.json");
  return new Set(arr);
}

function parseTs() {
  const src = readFileSync(TS, "utf8");
  const m = src.match(/export type ActivityStatus =([\s\S]*?);/);
  if (!m) throw new Error("ActivityStatus type alias not found in activity.ts");
  const out = new Set();
  for (const lit of m[1].matchAll(/"([a-z_]+)"/g)) out.add(lit[1]);
  return out;
}

function diff(label, a, b) {
  const missing = [...a].filter((x) => !b.has(x));
  const extra = [...b].filter((x) => !a.has(x));
  return { label, missing, extra };
}

const rust = parseRust();
const schema = parseSchema();
const ts = parseTs();

const reports = [
  diff("schema vs rust", rust, schema),
  diff("ts union vs rust", rust, ts),
  diff("rust vs schema", schema, rust),
  diff("rust vs ts union", ts, rust),
];

let bad = false;
for (const r of reports) {
  if (r.missing.length === 0 && r.extra.length === 0) continue;
  bad = true;
  console.error(`drift in ${r.label}:`);
  if (r.missing.length) console.error(`  missing on right: ${r.missing.join(", ")}`);
  if (r.extra.length) console.error(`  extra on right:   ${r.extra.join(", ")}`);
}

if (bad) {
  console.error("");
  console.error("Fix by adding/removing variants so all three sources match.");
  console.error(`  rust   (${rust.size}): ${[...rust].sort().join(", ")}`);
  console.error(`  schema (${schema.size}): ${[...schema].sort().join(", ")}`);
  console.error(`  ts     (${ts.size}): ${[...ts].sort().join(", ")}`);
  process.exit(1);
}

console.log(`ActivityStatus aligned across rust / schema / ts (${rust.size} variants).`);
