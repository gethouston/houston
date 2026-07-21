import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import learningsSchema from "@houston-ai/agent-schemas/learnings.schema.json" with {
  type: "json",
};
import { parseAgentJson } from "../src/data/agent-json.ts";

const schema = learningsSchema as Parameters<typeof parseAgentJson>[2];
const configSchema = { type: "object" } as Parameters<typeof parseAgentJson>[2];

function collect() {
  const warnings: string[] = [];
  return { warnings, warn: (m: string) => warnings.push(m) };
}

const ENTRY = { id: "a", text: "hi", created_at: "2026-07-21T00:00:00Z" };

describe("parseAgentJson", () => {
  it("passes a valid array through without warnings", () => {
    const { warnings, warn } = collect();
    const out = parseAgentJson(
      "learnings",
      JSON.stringify([ENTRY]),
      schema,
      [],
      warn,
    );
    deepStrictEqual(out, [ENTRY]);
    deepStrictEqual(warnings, []);
  });

  // Regression: an agent wrote `{"learnings": [...]}` instead of a bare array;
  // `(q.data ?? []).map` then crashed the whole app on every render.
  it("falls back when an object lands where an array belongs", () => {
    const { warnings, warn } = collect();
    const out = parseAgentJson(
      "learnings",
      JSON.stringify({ learnings: [ENTRY] }),
      schema,
      [],
      warn,
    );
    deepStrictEqual(out, []);
    ok(warnings.some((w) => w.includes("wrong top-level shape")));
  });

  it("falls back on scalar top-level values", () => {
    const { warn } = collect();
    deepStrictEqual(
      parseAgentJson("learnings", '"oops"', schema, [], warn),
      [],
    );
    deepStrictEqual(parseAgentJson("learnings", "42", schema, [], warn), []);
    deepStrictEqual(parseAgentJson("learnings", "null", schema, [], warn), []);
  });

  it("falls back when an array lands where an object belongs", () => {
    const { warnings, warn } = collect();
    const out = parseAgentJson("config", "[1,2]", configSchema, {}, warn);
    deepStrictEqual(out, {});
    ok(warnings.some((w) => w.includes("wrong top-level shape")));
  });

  it("falls back on invalid JSON", () => {
    const { warnings, warn } = collect();
    deepStrictEqual(
      parseAgentJson("learnings", "{not json", schema, [], warn),
      [],
    );
    ok(warnings.some((w) => w.includes("invalid JSON")));
  });

  it("keeps schema-invalid items but warns (data bugs surface, UI survives)", () => {
    const { warnings, warn } = collect();
    const items = [{ id: "a", text: "hi" }]; // missing created_at
    const out = parseAgentJson(
      "learnings",
      JSON.stringify(items),
      schema,
      [],
      warn,
    );
    deepStrictEqual(out, items);
    strictEqual(warnings.length, 1);
    ok(warnings[0].includes("schema validation failed"));
  });
});
