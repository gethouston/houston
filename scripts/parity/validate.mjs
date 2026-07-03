/**
 * Inventory + changelog validation for the parity contract. Pure functions over
 * already-parsed objects; each returns an array of violation strings (empty ==
 * clean). Precise by design: an unknown key or a bad shape is a hard fail,
 * because a silently-ignored field would let the contract rot. Manifest
 * validation lives in ./manifest.mjs.
 */
import {
  COMPONENT_KEYS,
  isInt,
  isNonEmptyString,
  isObject,
  isStringArray,
  KEBAB,
  NONEMPTY_ARRAYS,
  STRING_FIELDS,
} from "./schema.mjs";

/**
 * Validate inventory.yaml. Returns { violations, version, sinceById } so callers
 * can cross-check manifests even when some components are malformed (sinceById
 * holds only the components that passed).
 */
export function validateInventory(inv) {
  const violations = [];
  const sinceById = new Map();
  if (!isObject(inv)) {
    return {
      violations: ["[inventory] top-level must be a mapping"],
      version: null,
      sinceById,
    };
  }
  for (const key of Object.keys(inv)) {
    if (key !== "version" && key !== "components") {
      violations.push(
        `[inventory] unknown top-level key "${key}" (allowed: version, components)`,
      );
    }
  }
  const version = inv.version;
  if (!isInt(version) || version < 1) {
    violations.push(
      `[inventory] version must be an integer >= 1 (got ${JSON.stringify(version)})`,
    );
  }
  if (!Array.isArray(inv.components) || inv.components.length === 0) {
    violations.push("[inventory] components must be a non-empty list");
    return { violations, version: isInt(version) ? version : null, sinceById };
  }

  const seen = new Set();
  inv.components.forEach((comp, i) => {
    violations.push(...validateComponent(comp, i, version, seen, sinceById));
  });

  return { violations, version: isInt(version) ? version : null, sinceById };
}

/** Validate one inventory component; records a valid id->since into sinceById. */
function validateComponent(comp, i, version, seen, sinceById) {
  const at = `[inventory] components[${i}]`;
  if (!isObject(comp)) return [`${at} must be a mapping`];
  const out = [];
  const id = comp.id;
  const label = isNonEmptyString(id) ? `component "${id}"` : at;

  for (const key of Object.keys(comp)) {
    if (!COMPONENT_KEYS.includes(key))
      out.push(`[inventory] ${label}: unknown key "${key}"`);
  }
  for (const key of COMPONENT_KEYS) {
    if (!(key in comp))
      out.push(`[inventory] ${label}: missing required field "${key}"`);
  }
  if (!isNonEmptyString(id) || !KEBAB.test(id)) {
    out.push(
      `[inventory] ${at}: id must be a kebab-case string (got ${JSON.stringify(id)})`,
    );
  } else if (seen.has(id)) {
    out.push(`[inventory] duplicate component id "${id}"`);
  } else {
    seen.add(id);
  }
  for (const f of STRING_FIELDS) {
    if (f in comp && !isNonEmptyString(comp[f]))
      out.push(`[inventory] ${label}: ${f} must be a non-empty string`);
  }
  if ("variants" in comp && !isStringArray(comp.variants)) {
    out.push(`[inventory] ${label}: variants must be a list of strings`);
  }
  for (const f of NONEMPTY_ARRAYS) {
    if (f in comp && !(isStringArray(comp[f]) && comp[f].length > 0)) {
      out.push(
        `[inventory] ${label}: ${f} must be a non-empty list of strings`,
      );
    }
  }
  if ("since" in comp) {
    if (!isInt(comp.since) || comp.since < 1) {
      out.push(`[inventory] ${label}: since must be an integer >= 1`);
    } else if (isInt(version) && comp.since > version) {
      out.push(
        `[inventory] ${label}: since ${comp.since} exceeds inventory version ${version}`,
      );
    } else if (isNonEmptyString(id)) {
      sinceById.set(id, comp.since);
    }
  }
  return out;
}

/** version bumped => CHANGELOG.md must carry a matching `## vN` heading. */
export function validateChangelog(text, version) {
  if (!isInt(version)) return [];
  const re = new RegExp(`^##\\s+v?${version}\\b`, "m");
  return re.test(text)
    ? []
    : [
        `[changelog] no "## v${version}" entry for inventory version ${version}`,
      ];
}
