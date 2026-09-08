/**
 * The assistant operation catalog's WIRE shape: the document
 * `pnpm gen:assistant-catalog` writes to
 * `packages/host/src/assistant/assistant-catalog.generated.json`, which the
 * host imports as a module — embedded at build time, never located on disk —
 * to describe and dispatch user-facing Houston operations.
 *
 * Declared ONCE, here, because the writer (`ui/engine-client/scripts`) and the
 * reader (`packages/host/src/assistant`) sit in different packages and nothing
 * else makes them agree: two hand-kept copies of a wire shape drift, and the
 * drift surfaces as a catalog the host silently refuses to load — the whole
 * assistant family off, with one log line. Domain is the lowest package both
 * sides already build on, so it is where the shape belongs.
 *
 * Generic over `Schema` for one reason: a parameter's `schema` and an
 * operation's `returns` are arbitrary JSON Schema on the wire. The generator
 * emits them as plain JSON; the host re-reads the same bytes as typebox
 * schemas so it can check arguments against them. Same document, one
 * representation each, rather than a second declaration.
 */

/** Arbitrary JSON Schema, as it sits in the document. */
export type AssistantJsonSchema = Record<string, unknown>;

/** The only envelope version this generation of the format uses. */
export const ASSISTANT_CATALOG_VERSION = 3;

export type AssistantHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * How a path parameter's value is escaped into the URL.
 *
 * - `segment` — one path segment, the usual case.
 * - `path` — a relative path whose `/` separators survive because each segment
 *   is escaped on its own. Only the agent-file routes take one.
 */
export type AssistantPathEncoding = "segment" | "path";

export interface AssistantPathParam {
  name: string;
  encoding: AssistantPathEncoding;
}

/** The HTTP call one adapter operation makes, as the generator derived it. */
export interface AssistantRouteDocument {
  method: AssistantHttpMethod;
  /**
   * The FULL host path, with `{paramName}` placeholders where the adapter
   * interpolates a parameter. Nothing is prepended to it: the adapter sends
   * these paths verbatim, so any base added by a reader would be a second,
   * divergent dialect.
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
   * Never both; `null` on both means the operation sends no body. A caller
   * that reads only `body` sends an empty body for every `bodyFields` route.
   */
  body: string | null;
  bodyFields: Record<string, string> | null;
  /**
   * `true` when the adapter function post-processes what comes back (unwrapping
   * `items`, 404 fallbacks, `.then` transforms). A caller driving the route
   * directly receives the host's raw response instead.
   *
   * Descriptive, not dispatchable: the generator always writes it and the
   * capability docs report it, but nothing routes on it. Optional so a reader
   * never refuses a whole catalog over a field it does not read.
   */
  rawResponse?: boolean;
}

/**
 * One parameter, with what a caller needs to fill it in WITHOUT guessing.
 *
 * The schema alone answers "what shape", never "which value": a param typed
 * `string` that names an existing agent, routine or skill reads to a model as
 * an invitation to invent an identifier, and inventing one is how the assistant
 * addressed agents that do not exist. `description` and `source` are the
 * answer, so a reader can say where to look instead of echoing
 * `{"type":"string"}`.
 */
export interface AssistantParameterDocument<Schema = AssistantJsonSchema> {
  name: string;
  required: boolean;
  schema: Schema;
  /** The `@param` line from the operation's JSDoc, when the author wrote one. */
  description?: string;
  /**
   * The catalog operation whose result contains this parameter's accepted
   * values (`listAgents` for an agent id, `listRoutines` for a routine id).
   * Absent when the schema is already a closed set, or when nothing lists them.
   */
  source?: string;
}

export interface AssistantOperationDocument<Schema = AssistantJsonSchema> {
  name: string;
  group: string;
  description: string;
  /**
   * Destructive, costly or hard to reverse: the caller refuses it and raises an
   * approval card, and performs it only once the USER has answered yes to that
   * exact call. The model has no way to declare an approval.
   */
  confirm: boolean;
  /** Withheld entirely — never listed, never described, never callable. */
  hidden: boolean;
  params: AssistantParameterDocument<Schema>[];
  returns: Schema;
  /** `null` when no route could be derived conservatively from the source. */
  route: AssistantRouteDocument | null;
}

export interface AssistantCatalogDocument<Schema = AssistantJsonSchema> {
  /**
   * A note for whoever opens the generated file. Written by the generator,
   * never relied on by a reader, so a document without one is still valid.
   */
  $comment?: string;
  version: number;
  /** sha256 of the adapter sources the catalog was generated from. */
  sourceHash: string;
  operations: AssistantOperationDocument<Schema>[];
}
