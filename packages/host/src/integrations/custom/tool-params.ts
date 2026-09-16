import type { ToolMatch } from "../types";

/** The one call that knows an action's input schema: `executor.tools.schema`
 *  (a ToolSchemaView, or null for an address the engine no longer has). */
export type ToolSchemaLookup = (
  address: string,
) => Promise<{ inputSchema?: unknown } | null>;

/**
 * Attach each custom action's input schema to its search match.
 *
 * `executor.tools.list()` returns only the invocation columns (address, name,
 * description, annotations) — never `input_schema` — so a match built from
 * the listing has no `inputParams` and the model sees the action with NO
 * parameters (PRODUCT-1841). In chat the model guesses the body from the
 * description; a routine told never to invent parameters stops with an
 * error instead. The schema lives behind `tools.schema(address)`, so every
 * action row is hydrated from it before the result leaves the provider.
 * App rows (action "") have no schema; a match that already carries one
 * keeps it; a null view (address gone) leaves the row as it was.
 */
export async function attachToolParams(
  items: ToolMatch[],
  schemaOf: ToolSchemaLookup,
): Promise<ToolMatch[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.action === "" || item.inputParams !== undefined) return item;
      const view = await schemaOf(item.action);
      if (view?.inputSchema === undefined) return item;
      return { ...item, inputParams: view.inputSchema };
    }),
  );
}
