import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { agentNameIssue } from "../src/lib/agent-name.ts";

describe("agentNameIssue", () => {
  const existing = ["Personal assistant", "Bookkeeper"];

  it("passes ordinary unique names", () => {
    strictEqual(agentNameIssue("Growth Lead", existing), null);
    strictEqual(agentNameIssue("  Growth Lead  ", existing), null);
  });

  it("stays quiet on an empty name (the submit button is just disabled)", () => {
    strictEqual(agentNameIssue("", existing), null);
    strictEqual(agentNameIssue("   ", existing), null);
  });

  it("flags path separators, traversal, and leading dots", () => {
    strictEqual(agentNameIssue("hello/", existing), "invalidChars");
    strictEqual(agentNameIssue("a\\b", existing), "invalidChars");
    strictEqual(agentNameIssue("a..b", existing), "invalidChars");
    strictEqual(agentNameIssue(".hidden", existing), "invalidChars");
  });

  it("flags over-long names", () => {
    strictEqual(agentNameIssue("x".repeat(65), existing), "tooLong");
  });

  it("flags duplicates case-insensitively (agent folders land on case-insensitive filesystems)", () => {
    strictEqual(agentNameIssue("Bookkeeper", existing), "taken");
    strictEqual(agentNameIssue("bookkeeper", existing), "taken");
    strictEqual(agentNameIssue("  BOOKKEEPER  ", existing), "taken");
  });
});
