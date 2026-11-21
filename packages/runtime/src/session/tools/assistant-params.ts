import type { AssistantOperation } from "@houston/host/src/assistant/catalog";
import { Value } from "typebox/value";
import type { AssistantError } from "./assistant-result";
import { invalidParamMessage } from "./assistant-schema-hint";

export type AssistantParamCheck =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: AssistantError };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

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
          message: invalidParamMessage({
            operation: op.name,
            param: param.name,
            schema: param.schema,
            value,
          }),
        },
      };
    }
    params[param.name] = value;
  }
  return { ok: true, params };
}
