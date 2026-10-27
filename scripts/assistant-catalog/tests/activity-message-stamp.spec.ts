import { expect, it } from "vitest";
import { extractCatalog } from "../assistant-extractor.ts";
import { realOptions } from "./assistant-catalog-support.ts";

it("generic activity edits never offer the AI Manager a message stamp", () => {
  const operation = extractCatalog(realOptions).catalog.operations.find(
    (op) => op.name === "updateActivity",
  );
  expect(operation).toBeDefined();
  expect(operation?.params.map((param) => param.name)).toEqual([
    "agentId",
    "id",
    "updates",
  ]);
  expect(JSON.stringify(operation?.route)).not.toContain("stamp");
});
