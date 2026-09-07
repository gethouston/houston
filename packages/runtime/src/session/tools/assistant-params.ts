import type { AssistantOperation } from "@houston/host/src/assistant/catalog";
import { Value } from "typebox/value";
import type { AssistantError } from "./assistant-result";

/**
 * Argument validation for `houston_call`. The catalog carries each param's JSON
 * Schema, so the tool checks the model's arguments HERE — before any request
 * leaves the runtime — instead of letting a mistyped argument surface as an
 * opaque gateway 400 the model cannot correct itself from.
 *
 * Fail closed: an argument the operation does not declare is an error, not
 * something to forward. A generic dispatcher that passed unknown keys through
 * would let a model reach fields no annotated operation exposes.
 */

export type AssistantParamCheck =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: AssistantError };

/** A plain argument bag (`{}`-rooted, not an array, not null). */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Check the model's arguments against one operation's declared params and
 * return them ORDERED as the operation declares them — the host maps that order
 * onto the client method's positional signature, so the order is contract, not
 * cosmetics. Params left out (optional, or explicitly `undefined`) are omitted.
 */
export function checkCallParams(
  op: AssistantOperation,
  raw: unknown,
): AssistantParamCheck {
  const given = asRecord(raw ?? {});
  if (!given) {
    return {
      ok: false,
      error: {
        code: "invalid_params",
        message: `params must be an object of named arguments for ${op.name}, keyed by parameter name.`,
      },
    };
  }

  const declared = new Set(op.params.map((p) => p.name));
  for (const key of Object.keys(given)) {
    if (declared.has(key)) continue;
    return {
      ok: false,
      error: {
        code: "unknown_param",
        message: `${op.name} takes no parameter "${key}". Its parameters are: ${[...declared].join(", ") || "(none)"}. Call houston_describe for their schemas.`,
      },
    };
  }

  const params: Record<string, unknown> = {};
  for (const param of op.params) {
    const value = given[param.name];
    if (value === undefined) {
      if (!param.required) continue;
      return {
        ok: false,
        error: {
          code: "missing_param",
          message: `${op.name} requires the parameter "${param.name}". Call houston_describe for its schema.`,
        },
      };
    }
    if (!Value.Check(param.schema, value)) {
      return {
        ok: false,
        error: {
          code: "invalid_param",
          message: `The value given for "${param.name}" does not match what ${op.name} accepts. Call houston_describe for its schema and try again.`,
        },
      };
    }
    params[param.name] = value;
  }
  return { ok: true, params };
}
