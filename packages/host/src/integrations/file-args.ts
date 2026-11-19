/**
 * File arguments: Composio marks an action argument that carries a file with
 * `file_uploadable: true` in the action's input schema (Gmail `attachment`,
 * Drive `file_to_upload`). Execute accepts only `{ name, mimetype, s3key }`
 * there, with an `s3key` from Composio's own files API for this project, so a
 * workspace path the agent passes must be uploaded first (file-staging.ts).
 *
 * The walk mirrors Composio's own SDK (`walkFileUploadableLeaves`): it follows
 * the runtime value down the schema and resolves `anyOf`/`oneOf`/`allOf` to the
 * single file-bearing variant whose shape matches the value, so Gmail's
 * `attachment: FileUploadable | FileUploadable[]` handles one file or a list.
 */

/** One action's catalog entry, as the provider describes it. */
export interface ActionDescription {
  action: string;
  toolkit: string;
  inputParams?: unknown;
}

/** One file an action will reference, before its bytes are uploaded. */
export interface FileUploadRequest {
  action: string;
  toolkit: string;
  filename: string;
  mimetype: string;
  /** Lowercase hex MD5 of the bytes. */
  md5: string;
}

/** Where to PUT the bytes, with exactly these headers; `key` is the s3key. */
export interface FileUploadSlot {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

type Schema = Record<string, unknown>;

const asSchema = (value: unknown): Schema | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Schema)
    : undefined;

const variantsOf = (schema: Schema): Schema[] =>
  (["anyOf", "oneOf", "allOf"] as const).flatMap((key) => {
    const list = schema[key];
    return Array.isArray(list)
      ? list.flatMap((v) => (asSchema(v) ? [asSchema(v) as Schema] : []))
      : [];
  });

/** Real file arguments sit a few levels deep; a deeper schema is pathological
 *  and must not overflow the stack. */
const MAX_DEPTH = 32;

/** Whether any node of the schema is a file argument. */
export function hasFileArgs(schema: unknown, depth = 0): boolean {
  const node = asSchema(schema);
  if (!node || depth > MAX_DEPTH) return false;
  if (node.file_uploadable === true) return true;
  const children = [
    ...Object.values(asSchema(node.properties) ?? {}),
    ...(Array.isArray(node.items) ? node.items : [node.items]),
    ...variantsOf(node),
  ];
  return children.some((child) => hasFileArgs(child, depth + 1));
}

function matchesShape(schema: Schema, value: unknown): boolean {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("array") || (!schema.type && schema.items))
    if (Array.isArray(value)) return true;
  if (types.includes("object") || (!schema.type && schema.properties))
    if (asSchema(value)) return true;
  if (types.includes("string") && typeof value === "string") return true;
  return false;
}

/**
 * A copy of `value` with every value sitting at a file argument passed through
 * `leaf`; everything else is returned as it came. Nothing is mutated.
 */
export async function mapFileArgs(
  value: unknown,
  schema: unknown,
  leaf: (value: unknown) => Promise<unknown>,
  depth = 0,
): Promise<unknown> {
  const node = asSchema(schema);
  if (!node || depth > MAX_DEPTH) return value;
  if (node.file_uploadable === true) return leaf(value);
  const fileVariants = variantsOf(node).filter((v) => hasFileArgs(v));
  if (fileVariants.length > 0) {
    const variant =
      fileVariants.find((v) => matchesShape(v, value)) ?? fileVariants[0];
    return mapFileArgs(value, variant, leaf, depth + 1);
  }
  const properties = asSchema(node.properties);
  const record = asSchema(value);
  if (properties && record) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      out[key] = Object.hasOwn(properties, key)
        ? await mapFileArgs(child, properties[key], leaf, depth + 1)
        : child;
    }
    return out;
  }
  if (Array.isArray(value) && node.items !== undefined) {
    const items = Array.isArray(node.items) ? node.items[0] : node.items;
    return Promise.all(
      value.map((item) => mapFileArgs(item, items, leaf, depth + 1)),
    );
  }
  return value;
}
