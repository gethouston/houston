/**
 * Per-surface manifest validation for the parity contract. Pure function over an
 * already-loaded manifest, returning violation strings (empty == clean).
 */
import {
  ENTRY_KEYS,
  isInt,
  isNonEmptyString,
  isObject,
  MANIFEST_KEYS,
  STATUSES,
} from "./schema.mjs";

/**
 * Validate one manifest against the inventory. `sinceById` maps id -> since for
 * the components that passed inventory validation; `invVersion` is the spec's
 * own version (a manifest may not claim to implement beyond it).
 */
export function validateManifest(m, sinceById, invVersion) {
  const violations = [];
  const tag = m.label ?? m.name;
  if (!isObject(m.value)) return [`[${tag}] top-level must be a mapping`];
  const man = m.value;

  for (const key of Object.keys(man)) {
    if (!MANIFEST_KEYS.includes(key))
      violations.push(`[${tag}] unknown top-level key "${key}"`);
  }
  if (man.surface !== m.name) {
    violations.push(
      `[${tag}] surface "${man.surface}" must match filename "${m.name}"`,
    );
  }
  if (typeof man.enforced !== "boolean") {
    violations.push(`[${tag}] enforced must be a boolean`);
  }
  const iv = man.inventoryVersion;
  if (!isInt(iv) || iv < 0) {
    violations.push(`[${tag}] inventoryVersion must be an integer >= 0`);
  } else if (isInt(invVersion) && iv > invVersion) {
    violations.push(
      `[${tag}] inventoryVersion ${iv} exceeds the inventory's version ${invVersion}`,
    );
  }
  if (!isObject(man.components)) {
    violations.push(
      `[${tag}] components must be a mapping of component-id -> entry`,
    );
    return violations;
  }

  for (const [id, entry] of Object.entries(man.components)) {
    violations.push(...validateEntry(tag, id, entry, sinceById));
  }

  const enforced = man.enforced === true;
  for (const [id, since] of sinceById) {
    const entry = man.components[id];
    if (!entry) {
      violations.push(`[${tag}] missing entry for component "${id}"`);
      continue;
    }
    if (
      enforced &&
      isInt(iv) &&
      since <= iv &&
      entry.status === "not-started"
    ) {
      violations.push(
        `[${tag}] enforced surface at inventoryVersion ${iv} has "${id}" (since ${since}) still not-started`,
      );
    }
  }

  return violations;
}

/** Validate a single component entry's shape + status. */
function validateEntry(tag, id, entry, sinceById) {
  if (!sinceById.has(id)) {
    return [`[${tag}] references unknown component "${id}" (not in inventory)`];
  }
  if (!isObject(entry)) return [`[${tag}] "${id}": entry must be a mapping`];
  const out = [];
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key))
      out.push(`[${tag}] "${id}": unknown key "${key}"`);
  }
  if (!STATUSES.has(entry.status)) {
    out.push(
      `[${tag}] "${id}": status must be one of implemented|partial|not-started (got ${JSON.stringify(entry.status)})`,
    );
  }
  for (const f of ["notes", "ref"]) {
    if (f in entry && !isNonEmptyString(entry[f]))
      out.push(`[${tag}] "${id}": ${f} must be a non-empty string`);
  }
  return out;
}
