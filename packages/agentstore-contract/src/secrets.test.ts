import { describe, expect, it } from "vitest";
import { exampleAgentIr } from "./__fixtures__/example-ir";
import type { AgentIR } from "./ir";
import { scanForSecrets, scanIrForSecrets } from "./secrets";

const SAMPLES: Array<[string, string]> = [
  ["AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
  ["Anthropic API key", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"],
  ["OpenAI API key", `sk-proj-${"a".repeat(24)}`],
  ["Google API key", `AIza${"A".repeat(35)}`],
  ["GitHub token", `ghp_${"a".repeat(36)}`],
  ["Slack token", "xoxb-12345678901234"],
  ["Stripe secret key", `sk_live_${"a".repeat(24)}`],
  ["Private key block", "-----BEGIN RSA PRIVATE KEY-----"],
  [
    "JWT",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
  ],
  ["Bearer credential", `Bearer ${"a".repeat(26)}`],
];

describe("scanForSecrets", () => {
  for (const [pattern, sample] of SAMPLES) {
    it(`catches ${pattern}`, () => {
      const findings = scanForSecrets(`some text ${sample} more text`);
      expect(findings.some((f) => f.pattern === pattern)).toBe(true);
    });
  }

  it("returns an empty array for clean text", () => {
    expect(scanForSecrets("nothing to see here, just prose.")).toEqual([]);
  });

  it("redacts keeping the first 4 and last 2 characters", () => {
    const [finding] = scanForSecrets("AKIAIOSFODNN7EXAMPLE");
    expect(finding?.excerpt).toBe("AKIA…LE");
  });

  it("dedupes repeated occurrences of the same secret", () => {
    const key = "AKIAIOSFODNN7EXAMPLE";
    const findings = scanForSecrets(`${key} and again ${key}`);
    expect(
      findings.filter((f) => f.pattern === "AWS access key id"),
    ).toHaveLength(1);
  });
});

describe("scanIrForSecrets", () => {
  const clone = (): AgentIR => structuredClone(exampleAgentIr);

  it("is clean for the example fixture", () => {
    expect(scanIrForSecrets(exampleAgentIr)).toEqual([]);
  });

  it("scans identity.name (v2 addition)", () => {
    const ir = clone();
    ir.identity.name = "AKIAIOSFODNN7EXAMPLE";
    expect(
      scanIrForSecrets(ir).some((f) => f.pattern === "AWS access key id"),
    ).toBe(true);
  });

  it("scans identity.tags (v2 addition)", () => {
    const ir = clone();
    // A raw secret can only reach a tag by bypassing validation; set one directly
    // to prove tags are part of the scanned surface (a v2 addition).
    ir.identity.tags = [`ghp_${"a".repeat(36)}`];
    expect(scanIrForSecrets(ir).some((f) => f.pattern === "GitHub token")).toBe(
      true,
    );
  });

  it("scans skill bodies", () => {
    const ir = clone();
    ir.skills[0].body = `see ${`sk_live_${"a".repeat(24)}`}`;
    expect(
      scanIrForSecrets(ir).some((f) => f.pattern === "Stripe secret key"),
    ).toBe(true);
  });

  it("scans learning texts", () => {
    const ir = clone();
    ir.learnings[0].text = `token: ${`ghp_${"z".repeat(36)}`}`;
    expect(scanIrForSecrets(ir).some((f) => f.pattern === "GitHub token")).toBe(
      true,
    );
  });

  it("scans the instructions and description", () => {
    const ir = clone();
    ir.instructions = "AKIAIOSFODNN7EXAMPLE";
    expect(
      scanIrForSecrets(ir).some((f) => f.pattern === "AWS access key id"),
    ).toBe(true);
  });
});
