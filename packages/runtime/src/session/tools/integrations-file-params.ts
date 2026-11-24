/**
 * How an action's FILE arguments read to the model. Composio marks them
 * `file_uploadable: true` and describes them as `{ name, mimetype, s3key }`
 * with an s3key "typically returned from a previous download action" — so
 * agents put their own file path in `s3key`, and every Gmail attachment and
 * Drive upload failed ("The file key does not belong to this project"). The
 * host now uploads a workspace file itself (host integrations/file-staging.ts),
 * so the model is shown the contract it can meet: a path, as a plain string.
 * This is the same rewrite Composio's own SDK applies for agents.
 */

/** The type a file argument shows in a params signature. */
export const FILE_PARAM_TYPE = "file-path";

const FILE_PARAM_DESCRIPTION =
  'Path of a file in your workspace, as a plain string (for example "reports/q3.pdf"). Houston uploads it to the app for you.';

/** Leads a search result that shows any file argument. */
export const FILE_PARAM_NOTE = `(A parameter typed ${FILE_PARAM_TYPE} takes the path of a file in your workspace as a plain string, for example "reports/q3.pdf"; a list of files takes a list of paths. Houston uploads the file to the app for you. Never pass an s3key, a {name, mimetype, s3key} object, or the file's contents.)`;

type Node = Record<string, unknown>;

const asNode = (value: unknown): Node | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : null;

/** Real file arguments sit a few levels deep; custom MCP schemas can nest
 *  thousands of levels, which would overflow the stack. */
const MAX_DEPTH = 32;

function rewrite(value: unknown, seen: { files: boolean }, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value))
    return value.map((v) => rewrite(v, seen, depth + 1));
  const node = asNode(value);
  if (!node) return value;
  if (node.file_uploadable === true) {
    seen.files = true;
    return {
      ...(typeof node.title === "string" ? { title: node.title } : {}),
      type: "string",
      format: "path",
      description: FILE_PARAM_DESCRIPTION,
      file_uploadable: true,
    };
  }
  const out: Node = {};
  for (const [key, child] of Object.entries(node)) {
    // Only schema-bearing keys recurse; `default`, `examples` and `enum` are
    // values, and a value that happens to carry the marker must stay as it is.
    out[key] = SCHEMA_KEYS.has(key)
      ? rewrite(child, seen, depth + 1)
      : MAP_KEYS.has(key) && asNode(child)
        ? Object.fromEntries(
            Object.entries(child as Node).map(([k, v]) => [
              k,
              rewrite(v, seen, depth + 1),
            ]),
          )
        : child;
  }
  return out;
}

const SCHEMA_KEYS = new Set([
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "additionalProperties",
]);
const MAP_KEYS = new Set(["properties", "$defs", "definitions"]);

/** The schema as the model should read it, and whether it takes a file. */
export function presentFileParams(schema: unknown): {
  schema: unknown;
  hasFiles: boolean;
} {
  const seen = { files: false };
  const rewritten = rewrite(schema, seen);
  return { schema: seen.files ? rewritten : schema, hasFiles: seen.files };
}
