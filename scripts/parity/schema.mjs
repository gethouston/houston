/**
 * Shared predicates + schema constants for the parity validators
 * (validate.mjs for the inventory, manifest.mjs for the surface manifests).
 */

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMPONENT_KEYS = [
  "id",
  "title",
  "purpose",
  "anatomy",
  "states",
  "variants",
  "behavior",
  "a11y",
  "since",
];
export const STRING_FIELDS = ["title", "purpose", "behavior", "a11y"];
export const NONEMPTY_ARRAYS = ["anatomy", "states"];
export const STATUSES = new Set(["implemented", "partial", "not-started"]);
export const ENTRY_KEYS = new Set(["status", "notes", "ref"]);
export const MANIFEST_KEYS = [
  "surface",
  "enforced",
  "inventoryVersion",
  "components",
];

export const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const isInt = (v) => typeof v === "number" && Number.isInteger(v);
export const isNonEmptyString = (v) =>
  typeof v === "string" && v.trim().length > 0;
export const isStringArray = (v) =>
  Array.isArray(v) && v.every(isNonEmptyString);
