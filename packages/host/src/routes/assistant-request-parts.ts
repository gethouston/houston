import type {
  AssistantPathEncoding,
  AssistantRoute,
} from "../assistant/catalog";

/**
 * The pieces of one outbound request, built from a catalog route and the
 * caller's named arguments — or the refusal that replaces the whole call.
 * Split from the dispatcher so the address/query/body rules read on their own.
 */

/** A `{param}` placeholder the catalog's `pathParams` did not declare. */
const UNSUBSTITUTED = /\{[^}]*\}/;

export type AssistantDispatchCode =
  | "operation_not_supported"
  | "invalid_params";

export interface AssistantRefusal {
  ok: false;
  code: AssistantDispatchCode;
  message: string;
}

export const refuse = (
  code: AssistantDispatchCode,
  message: string,
): AssistantRefusal => ({ ok: false, code, message });

/** Own properties only: a catalog param named `constructor` must read as absent. */
export function arg(params: Record<string, unknown>, name: string): unknown {
  return Object.hasOwn(params, name) ? params[name] : undefined;
}

/**
 * Query and path values are scalars on the wire. Anything else (an object, an
 * array) means the catalog and the caller disagree about the parameter — a 400,
 * never a `[object Object]` smuggled into a URL.
 */
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

/** A built piece of the request, or the refusal that replaces the whole call. */
export type Built<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: AssistantRefusal };

export const built = <T>(value: T): Built<T> => ({ ok: true, value });
export const blocked = <T>(
  code: AssistantDispatchCode,
  message: string,
): Built<T> => ({ ok: false, refusal: refuse(code, message) });

/**
 * Escape one path value the way the adapter escapes it. A `path` parameter
 * carries a relative path, so its `/` separators must survive while every
 * segment is still escaped — collapsing it into one segment would address a
 * file literally named `a/b` instead of `b` inside `a`.
 */
function escapePathValue(value: string, encoding: AssistantPathEncoding) {
  return encoding === "path"
    ? value.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
}

export function buildPath(
  route: AssistantRoute,
  params: Record<string, unknown>,
): Built<string> {
  let path = route.path;
  for (const { name, encoding } of route.pathParams) {
    const value = scalar(arg(params, name));
    if (value === null || value === "") {
      return blocked(
        "invalid_params",
        `"${name}" must be a non-empty value: it is part of the address this operation acts on`,
      );
    }
    path = path.replaceAll(`{${name}}`, escapePathValue(value, encoding));
  }
  // A placeholder the catalog's `pathParams` never declared: the generator and
  // this dispatcher disagree, so no address can be built from it.
  if (UNSUBSTITUTED.test(path)) {
    return blocked("operation_not_supported", "this host cannot address it");
  }
  return built(path);
}

export function buildQuery(
  route: AssistantRoute,
  params: Record<string, unknown>,
): Built<Record<string, string>> {
  const query: Record<string, string> = {};
  for (const [key, name] of Object.entries(route.query)) {
    const raw = arg(params, name);
    // An omitted optional parameter drops its key, matching the client's own
    // `if (v !== undefined && v !== null)` filter.
    if (raw === undefined || raw === null) continue;
    const value = scalar(raw);
    if (value === null) {
      return blocked("invalid_params", `"${name}" must be a text value`);
    }
    query[key] = value;
  }
  return built(query);
}

/**
 * A `bodyFields` value: a parameter by name, or one of its fields by a dotted
 * read (`seed.claudeMd`). Own properties only at every step, and a non-object
 * on the way down reads as absent rather than throwing.
 */
function read(params: Record<string, unknown>, reference: string): unknown {
  let value: unknown = params;
  for (const key of reference.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    const owner = value as Record<string, unknown>;
    if (!Object.hasOwn(owner, key)) return undefined;
    value = owner[key];
  }
  return value;
}

/**
 * The JSON body this route sends, or `undefined` for none. `bodyFields` skips
 * parameters the caller omitted, exactly as `JSON.stringify` drops the
 * `undefined` properties of the adapter's inline object literal.
 */
export function buildBody(
  route: AssistantRoute,
  params: Record<string, unknown>,
): unknown {
  if (route.body !== null) return arg(params, route.body);
  if (route.bodyFields === null) return undefined;
  const body: Record<string, unknown> = {};
  for (const [key, reference] of Object.entries(route.bodyFields)) {
    const value = read(params, reference);
    if (value !== undefined) body[key] = value;
  }
  return body;
}
