import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AGENT_NAME_MAX_LENGTH,
  agentNameIssue,
  uniqueAgentName,
} from "../src/lib/agent-name.ts";

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

  it("flags a duplicate typed in another Unicode form (NFD vs NFC), like the host", () => {
    strictEqual(agentNameIssue("Jose\u0301", ["Jos\u00e9"]), "taken");
  });

  it("flags the AI Manager's own name as reserved, in any spelling", () => {
    strictEqual(agentNameIssue("Houston", existing), "reserved");
    strictEqual(agentNameIssue("  HOUSTON ", existing), "reserved");
    strictEqual(agentNameIssue("houston", ["Houston"]), "reserved");
  });

  it("leaves names that only contain Houston free", () => {
    strictEqual(agentNameIssue("Houston Sales", existing), null);
    strictEqual(agentNameIssue("Houston 2", existing), null);
  });

  it("lets an agent already called Houston keep any spelling of its name", () => {
    strictEqual(agentNameIssue("houston", existing, "Houston"), null);
    strictEqual(agentNameIssue("Houston", existing, "Mia"), "reserved");
  });
});

describe("uniqueAgentName", () => {
  it("keeps a free name, tidied", () => {
    strictEqual(uniqueAgentName("  Ava ", ["Pax"]), "Ava");
  });

  it("never hands a new employee the AI Manager's name", () => {
    strictEqual(uniqueAgentName("Houston", []), "Houston 2");
    strictEqual(uniqueAgentName(" houston ", ["Houston 2"]), "houston 3");
  });

  it("numbers a taken name past every variant already held", () => {
    strictEqual(uniqueAgentName("Ava", ["ava"]), "Ava 2");
    strictEqual(uniqueAgentName("Ava", ["Ava", "AVA 2", "Ava 3"]), "Ava 4");
  });

  it("keeps a numbered variant of a full-length name within the host's limit", () => {
    const full = "a".repeat(AGENT_NAME_MAX_LENGTH);
    const variant = uniqueAgentName(full, [full]);
    strictEqual(variant, `${"a".repeat(AGENT_NAME_MAX_LENGTH - 2)} 2`);
    strictEqual(agentNameIssue(variant, [full]), null);
  });

  it("never ends the shortened base in a space", () => {
    const base = `${"a".repeat(AGENT_NAME_MAX_LENGTH - 3)} bc`;
    strictEqual(
      uniqueAgentName(base, [base]),
      `${"a".repeat(AGENT_NAME_MAX_LENGTH - 3)} 2`,
    );
  });

  it("never splits a character outside the basic plane when shortening", () => {
    const base = `${"a".repeat(AGENT_NAME_MAX_LENGTH - 3)}\u{1F600}`;
    const variant = uniqueAgentName(base, [base]);
    strictEqual(variant, `${"a".repeat(AGENT_NAME_MAX_LENGTH - 3)} 2`);
    strictEqual(variant.isWellFormed(), true);
    strictEqual(agentNameIssue(variant, [base]), null);
  });

  it("keeps whole emoji that still fit within the host's limit", () => {
    const base = `${"a".repeat(AGENT_NAME_MAX_LENGTH - 4)}\u{1F600}\u{1F600}`;
    const variant = uniqueAgentName(base, [base]);
    strictEqual(variant, `${"a".repeat(AGENT_NAME_MAX_LENGTH - 4)}\u{1F600} 2`);
    strictEqual(variant.length, AGENT_NAME_MAX_LENGTH);
  });
});
