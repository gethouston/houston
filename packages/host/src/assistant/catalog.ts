import { readFileSync } from "node:fs";
import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";

/**
 * The generated assistant operation catalog — one entry per user-facing Houston
 * operation (a function of the live engine adapter,
 * `packages/web/src/engine-adapter`, carrying an `@assistant` JSDoc tag),
 * emitted to `ui/engine-client/generated/assistant-catalog.json` by
 * `pnpm gen:assistant-catalog`.
 *
 * The catalog is DATA, not code: the runtime describes operations to the model
 * from it and the host's dispatcher (`routes/assistant-sandbox.ts`) turns them
 * into gateway requests from it, so a newly annotated operation ships by
 * regenerating the file — never by adding a tool or a routing-table entry.
 *
 * It lives in the host because the host is the lower package: the runtime
 * depends on `@houston/host`, never the reverse. Nothing here reads the real
 * file; the path arrives from the caller so tests drive a fixture.
 */

/** The only envelope version this build knows how to read. */
export const ASSISTANT_CATALOG_VERSION = 3;

export type AssistantHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * How a path parameter's value is escaped into the URL: `segment` is one URL
 * segment, `path` is a relative path whose `/` separators survive because each
 * segment is escaped on its own (the agent-file routes).
 */
export type AssistantPathEncoding = "segment" | "path";

export interface AssistantPathParam {
  name: string;
  encoding: AssistantPathEncoding;
}

/** The HTTP call one adapter operation makes, as the generator derived it. */
export interface AssistantRoute {
  method: AssistantHttpMethod;
  /**
   * The FULL host path, with `{paramName}` placeholders where the adapter
   * interpolates a parameter. Nothing is prepended to it: the adapter sends
   * these paths verbatim, so any base added here would be a second, divergent
   * dialect.
   */
  path: string;
  pathParams: AssistantPathParam[];
  /** Query-string key -> the parameter that supplies it. */
  query: Record<string, string>;
  /**
   * The JSON body, carried EITHER as one parameter sent whole (`body`) OR as a
   * map of body key -> the parameter supplying it (`bodyFields`) for the
   * functions that assemble an inline object literal. A `bodyFields` value
   * reads a parameter by name (`name`) or one of its fields (`seed.claudeMd`).
   * Never both; `null` on both means the operation sends no body. A caller that
   * reads only `body` sends an empty body for every `bodyFields` route.
   */
  body: string | null;
  bodyFields: Record<string, string> | null;
}

export interface AssistantOperationParam {
  name: string;
  required: boolean;
  /** The param's JSON Schema, checked with typebox's `Value.Check`. */
  schema: TSchema;
}

export interface AssistantOperation {
  name: string;
  group: string;
  description: string;
  /**
   * Destructive or hard to reverse: `houston_call` refuses it and raises an
   * approval card, and performs it only once the USER has answered yes to that
   * exact call (`packages/runtime/src/session/confirm-gate.ts`). The model has
   * no way to declare an approval.
   */
  confirm: boolean;
  /** Withheld entirely — never listed, never described, never callable. */
  hidden: boolean;
  params: AssistantOperationParam[];
  returns: TSchema;
  /** `null` when no route could be derived conservatively from the source. */
  route: AssistantRoute | null;
}

export interface AssistantCatalog {
  version: number;
  /** sha256 of the adapter sources the catalog was generated from. */
  sourceHash: string;
  operations: AssistantOperation[];
}

const RouteEnvelope = Type.Object({
  method: Type.Union([
    Type.Literal("GET"),
    Type.Literal("POST"),
    Type.Literal("PATCH"),
    Type.Literal("PUT"),
    Type.Literal("DELETE"),
  ]),
  path: Type.String(),
  pathParams: Type.Array(
    Type.Object({
      name: Type.String(),
      encoding: Type.Union([Type.Literal("segment"), Type.Literal("path")]),
    }),
  ),
  query: Type.Record(Type.String(), Type.String()),
  body: Type.Union([Type.String(), Type.Null()]),
  bodyFields: Type.Union([
    Type.Record(Type.String(), Type.String()),
    Type.Null(),
  ]),
});

/**
 * The envelope shape. Per-param `schema` / `returns` stay `Unknown` on purpose:
 * they are arbitrary JSON Schema, so the only meaningful check is the one
 * `Value.Check` performs later against a concrete argument.
 */
const CatalogEnvelope = Type.Object({
  version: Type.Number(),
  sourceHash: Type.String(),
  operations: Type.Array(
    Type.Object({
      name: Type.String(),
      group: Type.String(),
      description: Type.String(),
      confirm: Type.Boolean(),
      hidden: Type.Boolean(),
      params: Type.Array(
        Type.Object({
          name: Type.String(),
          required: Type.Boolean(),
          schema: Type.Unknown(),
        }),
      ),
      returns: Type.Unknown(),
      route: Type.Union([RouteEnvelope, Type.Null()]),
    }),
  ),
});

/**
 * Parse + shape-check one catalog document. Returns null (never throws) for
 * unreadable JSON, a wrong shape, or a version this build does not read — the
 * caller turns that into "the assistant family is off", never a crash.
 */
export function parseAssistantCatalog(raw: string): AssistantCatalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Value.Check(CatalogEnvelope, parsed)) return null;
  // SAFETY: the envelope check above pins every field this interface declares;
  // it only widens the two arbitrary-JSON-Schema fields to TSchema.
  const catalog = parsed as unknown as AssistantCatalog;
  return catalog.version === ASSISTANT_CATALOG_VERSION ? catalog : null;
}

/**
 * Load the catalog from disk. A missing file is a normal state on a deployment
 * that never packaged one — it disables the family with a named log line rather
 * than failing the boot.
 */
export function loadAssistantCatalog(
  path: string,
  log: (message: string) => void = console.warn,
): AssistantCatalog | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(
      `[assistant] off: no operation catalog at ${path} (${reason}). Run \`pnpm gen:assistant-catalog\` and package the generated file, or point HOUSTON_ASSISTANT_CATALOG at it.`,
    );
    return null;
  }
  const catalog = parseAssistantCatalog(raw);
  if (!catalog) {
    log(
      `[assistant] off: the operation catalog at ${path} is malformed or not version ${ASSISTANT_CATALOG_VERSION}. Regenerate it with \`pnpm gen:assistant-catalog\`.`,
    );
    return null;
  }
  return catalog;
}

/** Every operation the agent may see (hidden ones are withheld everywhere). */
export function visibleOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  return catalog.operations.filter((op) => !op.hidden);
}

/**
 * One operation by exact name, or undefined. A hidden operation resolves to
 * undefined so the agent cannot tell "withheld" from "does not exist" — the
 * hidden set is not a hint list.
 */
export function findVisibleOperation(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperation | undefined {
  return catalog.operations.find((op) => op.name === name && !op.hidden);
}
