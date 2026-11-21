import type { ToolMatch } from "../types";

export type ToolSchemaLookup = (address: string) => Promise<{
  inputSchema?: unknown;
  schemaDefinitions?: Record<string, unknown>;
} | null>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export async function attachToolParams(
  items: ToolMatch[],
  schemaOf: ToolSchemaLookup,
): Promise<ToolMatch[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.action === "" || item.inputParams !== undefined) return item;
      const view = await schemaOf(item.action);
      if (view?.inputSchema === undefined) return item;
      const inputParams =
        view.schemaDefinitions && isRecord(view.inputSchema)
          ? { ...view.inputSchema, $defs: view.schemaDefinitions }
          : view.inputSchema;
      return { ...item, inputParams };
    }),
  );
}
