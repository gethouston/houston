export type JsonSchema = Record<string, unknown>;

export interface AssistantParameter {
  name: string;
  required: boolean;
  schema: JsonSchema;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * How a path parameter's value is escaped into the URL.
 *
 * - `segment` — one path segment (`encodeURIComponent`), the usual case.
 * - `path` — a relative path whose `/` separators survive; each segment is
 *   escaped on its own. Only the agent-file routes take one.
 */
export type PathEncoding = "segment" | "path";

export interface AssistantPathParam {
  name: string;
  encoding: PathEncoding;
}

/**
 * The HTTP call one adapter operation makes. `path` is the FULL host path — no
 * base is prepended anywhere — with `{paramName}` placeholders where the source
 * interpolates a parameter.
 */
export interface AssistantRoute {
  method: HttpMethod;
  path: string;
  pathParams: AssistantPathParam[];
  /** Query-string key -> the parameter that supplies it. */
  query: Record<string, string>;
  /** The parameter sent as the whole JSON body. */
  body: string | null;
  /**
   * The JSON body assembled field by field: body key -> the parameter that
   * supplies it, either by name (`name`) or by one of its fields
   * (`seed.claudeMd`). At most one of `body` / `bodyFields` is set; both `null`
   * means no body.
   */
  bodyFields: Record<string, string> | null;
  /**
   * `true` when the adapter function post-processes what comes back (unwrapping
   * `items`, 404 fallbacks, `.then` transforms). A caller driving the route
   * directly receives the host's raw response instead.
   */
  rawResponse: boolean;
}

export interface AssistantOperation {
  name: string;
  group: string;
  description: string;
  confirm: boolean;
  hidden: boolean;
  params: AssistantParameter[];
  returns: JsonSchema;
  /** `null` when the route could not be derived conservatively from the source. */
  route: AssistantRoute | null;
}

export interface UnroutableOperation {
  name: string;
  reason: string;
}

export interface AssistantCatalog {
  $comment: string;
  version: 3;
  sourceHash: string;
  operations: AssistantOperation[];
}

export interface Coverage {
  undocumented: string[];
  ungrouped: string[];
  /** Operations whose `group` is outside the fixed taxonomy. */
  misgrouped: string[];
  unschematized: string[];
  hidden: string[];
  unroutable: UnroutableOperation[];
}

export interface ExtractionResult {
  catalog: AssistantCatalog;
  coverage: Coverage;
}

/**
 * The closed set of groups an operation may declare. A group outside it is a
 * typo or an invented taxonomy, and the coverage report fails it.
 */
export const ASSISTANT_GROUPS: readonly string[] = [
  "workspaces",
  "agents",
  "files",
  "missions",
  "chat",
  "routines",
  "skills",
  "integrations",
  "providers",
  "org",
  "teams",
  "spaces",
  "billing",
  "api-keys",
  "store",
  "attachments",
  "settings",
  "system",
];
