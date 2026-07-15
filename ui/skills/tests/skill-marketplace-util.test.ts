import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  formatInstalls,
  formatSkillDescription,
  kebabToTitle,
  ownerOf,
  repoOf,
} from "../src/skill-marketplace-util.ts";

describe("ownerOf", () => {
  it("takes the owner segment of owner/repo", () => {
    assert.equal(ownerOf("vercel/ai"), "vercel");
  });
  it("falls back to the whole string when there's no slash", () => {
    assert.equal(ownerOf("open.feishu.cn"), "open.feishu.cn");
  });
});

describe("repoOf", () => {
  it("takes the repo segment of owner/repo", () => {
    assert.equal(repoOf("vercel/ai"), "ai");
  });
  it("falls back to the whole string when there's no slash", () => {
    assert.equal(repoOf("open.feishu.cn"), "open.feishu.cn");
  });
});

describe("formatInstalls", () => {
  it("leaves small counts as-is", () => {
    assert.equal(formatInstalls(42), "42");
  });
  it("formats thousands with one decimal and a K suffix", () => {
    assert.equal(formatInstalls(39_565), "39.6K");
  });
  it("formats millions with one decimal and an M suffix", () => {
    assert.equal(formatInstalls(1_200_000), "1.2M");
  });
});

describe("kebabToTitle", () => {
  it("title-cases each hyphen-separated word", () => {
    assert.equal(
      kebabToTitle("vercel-react-best-practices"),
      "Vercel React Best Practices",
    );
  });
  it("drops empty segments from repeated hyphens", () => {
    assert.equal(kebabToTitle("ai--sdk"), "Ai Sdk");
  });
});

describe("formatSkillDescription", () => {
  it("splits a real skills.sh-style description into intro, list, and keywords", () => {
    const description =
      'Answer questions about the AI SDK and help build AI-powered features. Use when developers: (1) Ask about AI SDK functions like generateText, streamText, ToolLoopAgent, embed, or tools, (2) Want to build AI agents, chatbots, RAG systems, or text generation features, (3) Have questions about AI providers (OpenAI, Anthropic, Google, etc.), streaming, tool calling, structured output, or embeddings, (4) Use React hooks like useChat or useCompletion. Triggers on: "AI SDK", "Vercel AI SDK", "generateText".';
    const result = formatSkillDescription(description);
    assert.equal(
      result.intro,
      "Answer questions about the AI SDK and help build AI-powered features. Use when developers:",
    );
    assert.equal(result.items.length, 4);
    assert.equal(
      result.items[0],
      "Ask about AI SDK functions like generateText, streamText, ToolLoopAgent, embed, or tools",
    );
    assert.equal(
      result.items[3],
      "Use React hooks like useChat or useCompletion.",
    );
    assert.equal(result.keywords, '"AI SDK", "Vercel AI SDK", "generateText"');
  });

  it("leaves plain prose with no enumeration untouched, as the intro", () => {
    const result = formatSkillDescription("Draft a well-structured NDA.");
    assert.equal(result.intro, "Draft a well-structured NDA.");
    assert.deepEqual(result.items, []);
    assert.equal(result.keywords, null);
  });

  it("doesn't treat a single stray parenthetical as a list", () => {
    const result = formatSkillDescription(
      "Prep the annual filing (Delaware) before the deadline.",
    );
    assert.equal(
      result.intro,
      "Prep the annual filing (Delaware) before the deadline.",
    );
    assert.deepEqual(result.items, []);
  });

  it("has no keywords when there's no Triggers on clause", () => {
    const result = formatSkillDescription(
      "Step one: (1) gather documents, (2) fill the form.",
    );
    assert.equal(result.keywords, null);
    assert.equal(result.items.length, 2);
  });
});
