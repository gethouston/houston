import { expect, test } from "vitest";
import type { ToolMatch } from "../types";
import { attachToolParams } from "./tool-params";

/**
 * The executor's tool LISTING never carries an input schema (PRODUCT-1841):
 * a match built from it has no inputParams until `tools.schema(address)` is
 * consulted. These pin that every action row gets hydrated, and what is
 * left alone.
 */

const ORDER: ToolMatch = {
  action: "tools.comfer.org.default.json.getSaleOrder",
  toolkit: "comfer",
  description: "Read sale.order",
  connected: true,
  status: "connected",
};
const SCHEMA = {
  type: "object",
  properties: { body: { type: "object" } },
  required: ["body"],
};

test("an action row without params is hydrated from tools.schema", async () => {
  const asked: string[] = [];
  const out = await attachToolParams([ORDER], async (address) => {
    asked.push(address);
    return { inputSchema: SCHEMA };
  });
  expect(asked).toEqual([ORDER.action]);
  expect(out).toEqual([{ ...ORDER, inputParams: SCHEMA }]);
});

test("app rows and rows that already carry params are never looked up", async () => {
  const asked: string[] = [];
  const appRow: ToolMatch = {
    action: "",
    toolkit: "comfer",
    description: "COMFER (custom integration)",
  };
  const withParams: ToolMatch = { ...ORDER, inputParams: SCHEMA };
  const out = await attachToolParams([appRow, withParams], async (address) => {
    asked.push(address);
    return { inputSchema: { type: "object" } };
  });
  expect(asked).toEqual([]);
  expect(out).toEqual([appRow, withParams]);
});

test("hoisted definitions come back onto the schema as $defs so refs resolve", async () => {
  const body = { $ref: "#/$defs/SaleOrderBody" };
  const defs = { SaleOrderBody: { type: "object", required: ["domain"] } };
  const out = await attachToolParams([ORDER], async () => ({
    inputSchema: { type: "object", properties: { body } },
    schemaDefinitions: defs,
  }));
  expect(out[0]?.inputParams).toEqual({
    type: "object",
    properties: { body },
    $defs: defs,
  });
});

test("a null view (address gone) or a schema-less view leaves the row unchanged", async () => {
  const gone = await attachToolParams([ORDER], async () => null);
  expect(gone).toEqual([ORDER]);
  const bare = await attachToolParams([ORDER], async () => ({}));
  expect(bare).toEqual([ORDER]);
});

test("a schema lookup failure surfaces instead of silently dropping params", async () => {
  await expect(
    attachToolParams([ORDER], async () => {
      throw new Error("storage failure");
    }),
  ).rejects.toThrow("storage failure");
});
