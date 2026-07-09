import { describe, expect, it } from "vitest";
import {
  chunkProse,
  machineTranslate,
  splitTranslatableChunks,
} from "./machine-translate";

describe("splitTranslatableChunks", () => {
  it("keeps fenced code blocks out of the translatable chunks", () => {
    const md = "Intro.\n\n```js\nconst x = 1;\n```\n\nOutro.";
    const chunks = splitTranslatableChunks(md);
    expect(chunks.map((c) => c.translate)).toEqual([true, false, true]);
    expect(chunks[1]?.text).toContain("const x = 1;");
    expect(chunks.map((c) => c.text).join("")).toBe(md);
  });

  it("recognizes indented fences (code nested in lists)", () => {
    const md = "1. Run this:\n\n   ```bash\n   ls -la\n   ```\n\n2. Done.";
    const chunks = splitTranslatableChunks(md);
    const code = chunks.filter((c) => !c.translate);
    expect(code).toHaveLength(1);
    expect(code[0]?.text).toContain("ls -la");
    expect(chunks.map((c) => c.text).join("")).toBe(md);
  });

  it("handles text with no fences", () => {
    expect(splitTranslatableChunks("plain text")).toEqual([
      { text: "plain text", translate: true },
    ]);
  });
});

describe("chunkProse", () => {
  it("splits on blank lines under the cap and reassembles losslessly", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}\n\n${"c".repeat(60)}`;
    const pieces = chunkProse(text, 100);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe(text);
  });

  it("hard-splits a single block longer than the cap", () => {
    const table = Array.from({ length: 30 }, (_, i) => `| row ${i} |`).join(
      "\n",
    );
    const pieces = chunkProse(table, 100);
    expect(pieces.every((p) => p.length <= 100)).toBe(true);
    expect(pieces.join("")).toBe(table);

    const oneLine = "x".repeat(350);
    const hard = chunkProse(oneLine, 100);
    expect(hard.every((p) => p.length <= 100)).toBe(true);
    expect(hard.join("")).toBe(oneLine);
  });
});

describe("machineTranslate", () => {
  const echoFetch =
    (seen: string[]): typeof fetch =>
    async (_url, init) => {
      const q = decodeURIComponent(String(init?.body ?? "").replace(/^q=/, ""));
      seen.push(q);
      return new Response(JSON.stringify([[[`ES(${q})`, q]]]));
    };

  it("translates prose but never code, via the injected fetch", async () => {
    const seen: string[] = [];
    const [out] = await machineTranslate(
      ["Hello.\n\n```sh\nls\n```\n\nBye."],
      "es",
      echoFetch(seen),
    );
    expect(out).toContain("```sh\nls\n```");
    expect(out).toContain("ES(Hello.");
    expect(seen.join("")).not.toContain("ls");
  });

  it("keeps the newline margins around fences (gtx strips whitespace)", async () => {
    const [out] = await machineTranslate(
      ["Before.\n\n```sh\nls\n```\n\nAfter."],
      "es",
      echoFetch([]),
    );
    // The fence must stay at line start on both sides.
    expect(out).toBe("ES(Before.)\n\n```sh\nls\n```\n\nES(After.)");
  });

  it("throws with the status on a failing service", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("", { status: 429 });
    await expect(machineTranslate(["hi"], "es", fakeFetch)).rejects.toThrow(
      /429/,
    );
  });
});
