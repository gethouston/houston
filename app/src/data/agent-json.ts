/**
 * Pure parse/validate half of `readAgentJson` — kept free of Tauri imports so
 * it can be unit-tested (see `tests/agent-json.test.ts`).
 *
 * Agents edit `.houston/<name>/<name>.json` files directly, so any shape can
 * land on disk. Item-level schema mismatches only warn (surface data bugs, not
 * block the UI), but a wrong top-level container (an object where an array
 * belongs) falls back: callers do `data.map(...)` and would crash the app.
 */

import Ajv, { type Schema, type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

export function getValidator(name: string, schema: Schema): ValidateFunction {
  let v = validators.get(name);
  if (!v) {
    v = ajv.compile(schema);
    validators.set(name, v);
  }
  return v;
}

/** True when `parsed` has the same top-level container kind as `fallback`. */
function matchesContainerShape(parsed: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(parsed);
  if (fallback !== null && typeof fallback === "object")
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  return true;
}

export function parseAgentJson<T>(
  name: string,
  raw: string,
  schema: Schema,
  fallback: T,
  warn: (message: string, detail?: string) => void,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    warn(`${name}: invalid JSON, falling back`, String(e));
    return fallback;
  }
  if (!matchesContainerShape(parsed, fallback)) {
    warn(
      `${name}: wrong top-level shape (expected ${
        Array.isArray(fallback) ? "array" : "object"
      }), falling back`,
      JSON.stringify(parsed).slice(0, 200),
    );
    return fallback;
  }
  const validate = getValidator(name, schema);
  if (!validate(parsed)) {
    warn(`${name}: schema validation failed`, JSON.stringify(validate.errors));
  }
  return parsed as T;
}
