import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { toolShortName } from "@houston-ai/chat";
import {
  isFileCreateTool,
  isFileWriteTool,
} from "../src/lib/file-write-tools.ts";

describe("isFileWriteTool", () => {
  it("matches the pi runtime's lowercase file tools", () => {
    strictEqual(isFileWriteTool("write"), true);
    strictEqual(isFileWriteTool("edit"), true);
  });

  it("matches the PascalCase dialect", () => {
    strictEqual(isFileWriteTool("Write"), true);
    strictEqual(isFileWriteTool("Edit"), true);
    strictEqual(isFileWriteTool("MultiEdit"), true);
    strictEqual(isFileWriteTool("multi_edit"), true);
  });

  it("matches a namespaced tool by its short name", () => {
    strictEqual(isFileWriteTool("mcp__filesystem__write"), true);
    strictEqual(isFileWriteTool("mcp__filesystem__Edit"), true);
  });

  it("answers false for tools that write no file", () => {
    strictEqual(isFileWriteTool("read"), false);
    strictEqual(isFileWriteTool("bash"), false);
    strictEqual(isFileWriteTool("Grep"), false);
    strictEqual(isFileWriteTool(""), false);
  });
});

describe("isFileCreateTool", () => {
  it("names only the tools that create the file, in both dialects", () => {
    strictEqual(isFileCreateTool("write"), true);
    strictEqual(isFileCreateTool("Write"), true);
    strictEqual(isFileCreateTool("edit"), false);
    strictEqual(isFileCreateTool("MultiEdit"), false);
  });
});

describe("toolShortName", () => {
  it("drops the namespace, and leaves a plain name alone", () => {
    strictEqual(toolShortName("mcp__gmail__send_email"), "send_email");
    strictEqual(toolShortName("write"), "write");
  });
});
