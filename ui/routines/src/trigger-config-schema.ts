/**
 * Pure JSON-schema → form-fields mapper for a Composio trigger type's `config`
 * schema (C9 event-driven routines). The routine editor's config form is
 * generated from this: strings, numbers, booleans and enums become proper
 * fields; anything this mapper cannot model degrades the WHOLE form to a single
 * labeled JSON textarea (last resort), so a user never faces a broken control.
 *
 * Props-only and DOM-free (the `ui/` boundary): labels the UI shows come from
 * the schema (`title`/`description`) or a humanized key; localization of the
 * chrome around the fields is the consumer's job via `labels` props. Unit-tested
 * under bare node (`tests/trigger-config-schema.test.ts`).
 */

export type TriggerConfigFieldKind = "string" | "number" | "boolean" | "enum";

export interface TriggerConfigEnumOption {
  value: string;
  label: string;
}

export interface TriggerConfigField {
  /** Property name in the config object (the key we read/write). */
  key: string;
  kind: TriggerConfigFieldKind;
  /** Human label: schema `title`, else the humanized key. */
  label: string;
  /** Schema `description`, when present. */
  description?: string;
  required: boolean;
  /** Options for `enum` fields (value + human label). */
  options?: TriggerConfigEnumOption[];
  /** Schema `default`, when present (seeds an untouched field). */
  defaultValue?: string | number | boolean;
}

/**
 * Result of parsing a config schema. `supported: false` means the shape is not
 * modelable as simple fields, so the consumer renders a raw JSON textarea. An
 * `object` schema with no properties is `supported: true` with `fields: []`
 * (the trigger takes no configuration).
 */
export type ParsedTriggerConfig =
  | { supported: true; fields: TriggerConfigField[] }
  | { supported: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

/** "owner_login" / "ownerLogin" → "Owner login". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function enumOptions(raw: unknown): TriggerConfigEnumOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every(isPrimitive)) return null;
  return raw.map((v) => ({ value: String(v), label: humanizeKey(String(v)) }));
}

/** Map a single property spec to a field, or null when it is not modelable. */
function parseField(
  key: string,
  spec: Record<string, unknown>,
  required: boolean,
): TriggerConfigField | null {
  const label =
    typeof spec.title === "string" && spec.title.trim()
      ? spec.title
      : humanizeKey(key);
  const description =
    typeof spec.description === "string" && spec.description.trim()
      ? spec.description
      : undefined;
  const defaultValue = isPrimitive(spec.default) ? spec.default : undefined;

  const options = enumOptions(spec.enum);
  if (options) {
    return { key, kind: "enum", label, description, required, options };
  }

  switch (spec.type) {
    case "string":
      return {
        key,
        kind: "string",
        label,
        description,
        required,
        defaultValue,
      };
    case "number":
    case "integer":
      return {
        key,
        kind: "number",
        label,
        description,
        required,
        defaultValue,
      };
    case "boolean":
      return {
        key,
        kind: "boolean",
        label,
        description,
        required,
        defaultValue,
      };
    default:
      return null;
  }
}

/** Parse a trigger type's `config` JSON schema into simple form fields. */
export function parseTriggerConfigSchema(schema: unknown): ParsedTriggerConfig {
  if (!isRecord(schema)) return { supported: false };

  const props = schema.properties;
  // An object schema with no properties = a trigger that takes no config.
  if (props === undefined) {
    return schema.type === "object" || schema.type === undefined
      ? { supported: true, fields: [] }
      : { supported: false };
  }
  if (!isRecord(props)) return { supported: false };

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : [],
  );

  const fields: TriggerConfigField[] = [];
  for (const [key, spec] of Object.entries(props)) {
    if (!isRecord(spec)) return { supported: false };
    const field = parseField(key, spec, required.has(key));
    if (!field) return { supported: false };
    fields.push(field);
  }
  return { supported: true, fields };
}

/** Seed a config value object from field defaults (booleans default to false). */
export function defaultTriggerConfig(
  fields: TriggerConfigField[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.kind === "boolean") out[f.key] = false;
  }
  return out;
}

/** Coerce a raw form value to the field's type (number fields stay string
 *  until they parse; boolean passes through; enum/string kept as string). */
export function coerceConfigValue(
  kind: TriggerConfigFieldKind,
  raw: unknown,
): unknown {
  if (kind === "number") {
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    return raw;
  }
  return raw;
}

/** Which required fields are still empty. A form is valid when this is empty. */
export function missingRequired(
  fields: TriggerConfigField[],
  values: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.key];
    if (f.kind === "boolean") continue; // a boolean is always answered
    if (f.kind === "number") {
      if (v === undefined || v === "" || !Number.isFinite(Number(v))) {
        missing.push(f.key);
      }
      continue;
    }
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.push(f.key);
    }
  }
  return missing;
}
