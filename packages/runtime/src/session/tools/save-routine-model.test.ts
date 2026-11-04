import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { expect, test } from "vitest";
import { z } from "zod";
import { adaptTool } from "../../backends/claude/mcp-tool-adapter";
import { buildBridgedToolSet } from "../../backends/claude/mcp-tool-set";
import { makeSaveRoutineTool } from "./save-routine";

const base = { name: "Daily", prompt: "Summarize", schedule: "0 9 * * *" };

test.each([
  "pi",
  "claude",
])("%s exposes optional model and effort and sends explicit changes only", async (backend) => {
  const requests: unknown[] = [];
  const integrations = {
    call: async (_path: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "r1", ...base, model: "claude-opus-5-5" });
    },
  };
  const pi = makeSaveRoutineTool(integrations);
  const bridged = buildBridgedToolSet({ integrations }).find(
    (tool) => tool.name === "save_routine",
  );
  if (!bridged) throw new Error("save_routine missing from Claude tools");
  const claude = adaptTool(bridged);
  const schema = z.object(claude.inputSchema);
  const explicit = { ...base, model: "claude-opus-5-5", effort: "high" };
  const changed = { ...base, id: "r1", model: "claude-sonnet-5-5" };
  const omitted = { ...base, id: "r1" };
  if (backend === "pi") {
    expect(Value.Check(pi.parameters, { ...base, model: 42 })).toBe(false);
    expect(Value.Check(pi.parameters, { ...base, effort: 42 })).toBe(false);
    const ctx = {} as ExtensionToolContext;
    for (const params of [explicit, changed, omitted]) {
      await pi.execute("call", params, undefined, undefined, ctx);
    }
  } else {
    expect(schema.safeParse({ ...base, model: 42 }).success).toBe(false);
    expect(schema.safeParse({ ...base, effort: 42 }).success).toBe(false);
    for (const params of [explicit, changed, omitted]) {
      await claude.handler(schema.parse(params), {});
    }
  }
  expect(requests).toEqual([explicit, changed, omitted]);
});
