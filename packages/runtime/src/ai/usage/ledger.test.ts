import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTokenSpend, recordTokenSpend } from "./ledger";

const usage = (context: number, output: number) => ({
  context_tokens: context,
  output_tokens: output,
  cached_tokens: 0,
});

describe("token-spend ledger", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "houston-ledger-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null for a provider never metered", () => {
    expect(readTokenSpend("google", dir)).toBeNull();
  });

  it("accumulates turns per provider and stamps `since` on the first", () => {
    const t0 = new Date("2026-07-15T10:00:00.000Z");
    recordTokenSpend("google", usage(1_000, 200), dir, () => t0);
    recordTokenSpend("google", usage(2_500, 300), dir, () => new Date());
    recordTokenSpend("amazon-bedrock", usage(50, 5), dir, () => new Date());

    expect(readTokenSpend("google", dir)).toEqual({
      inputTokens: 3_500,
      outputTokens: 500,
      turns: 2,
      since: t0.toISOString(),
    });
    expect(readTokenSpend("amazon-bedrock", dir)).toEqual({
      inputTokens: 50,
      outputTokens: 5,
      turns: 1,
      since: expect.any(String),
    });
  });

  it("survives a corrupt ledger file: read → null, record starts fresh", () => {
    writeFileSync(join(dir, "token-usage.json"), "{not json", "utf8");
    expect(readTokenSpend("google", dir)).toBeNull();
    recordTokenSpend("google", usage(10, 1), dir);
    expect(readTokenSpend("google", dir)).toMatchObject({
      inputTokens: 10,
      outputTokens: 1,
      turns: 1,
    });
  });

  it("writes the file atomically (no lingering tmp)", () => {
    recordTokenSpend("google", usage(1, 1), dir);
    expect(() =>
      readFileSync(join(dir, "token-usage.json.tmp"), "utf8"),
    ).toThrow();
  });

  it("sanitizes junk numbers on read instead of propagating them", () => {
    writeFileSync(
      join(dir, "token-usage.json"),
      JSON.stringify({
        version: 1,
        providers: {
          google: { inputTokens: -5, outputTokens: "x", turns: 2, since: 3 },
        },
      }),
      "utf8",
    );
    expect(readTokenSpend("google", dir)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      turns: 2,
      since: "",
    });
  });
});
