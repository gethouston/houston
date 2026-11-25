import type { AssistantRoute } from "../assistant/catalog";
import { addressSegments, safeSegment } from "./assistant-path-segments";

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

export function arg(params: Record<string, unknown>, name: string): unknown {
  return Object.hasOwn(params, name) ? params[name] : undefined;
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

export type Built<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: AssistantRefusal };

export const built = <T>(value: T): Built<T> => ({ ok: true, value });
export const blocked = <T>(
  code: AssistantDispatchCode,
  message: string,
): Built<T> => ({ ok: false, refusal: refuse(code, message) });

function resolvesToItself(path: string): boolean {
  try {
    return new URL(`http://houston.invalid${path}`).pathname === path;
  } catch {
    return false;
  }
}

// WHY: new URL resolves .. and %2e%2e, and encoding keeps ..; the built path must resolve to itself. ADR-0016
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
    const segments = addressSegments(route, name, encoding, value);
    if (!segments.every(safeSegment)) {
      return blocked(
        "invalid_params",
        `"${name}" must not contain empty, "." or ".." parts: they would move this call onto a different operation's address`,
      );
    }
    path = path.replaceAll(
      `{${name}}`,
      encoding === "path"
        ? segments.map(encodeURIComponent).join("/")
        : encodeURIComponent(value),
    );
  }
  if (UNSUBSTITUTED.test(path)) {
    return blocked("operation_not_supported", "this host cannot address it");
  }
  if (!resolvesToItself(path)) {
    return blocked(
      "invalid_params",
      "those values do not address this operation",
    );
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
    if (raw === undefined || raw === null) continue;
    const value = scalar(raw);
    if (value === null) {
      return blocked("invalid_params", `"${name}" must be a text value`);
    }
    query[key] = value;
  }
  return built(query);
}

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
