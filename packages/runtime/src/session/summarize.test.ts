import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import {
  buildExcerpt,
  dispatchTitle,
  generateTitle,
  titleFromText,
} from "./summarize";

/**
 * Title generation runs a real pi turn (faux provider: scripted, no network),
 * proving the throwaway-session path works end to end — same auth machinery as
 * chat, so whatever OAuth flavor chat works with, titles work with.
 */

test("buildExcerpt trims to the first turns and caps lengths", () => {
  const long = "x".repeat(1000);
  const messages = Array.from({ length: 10 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `${i}:${long}`,
    ts: i,
  }));
  const excerpt = buildExcerpt(messages);
  expect(excerpt.length).toBeLessThanOrEqual(2400);
  expect(excerpt).toContain("user: 0:");
  expect(excerpt).not.toContain("6:"); // only the first 6 messages
});

test("titleFromText short-circuits empty input to '' without touching the model", async () => {
  // No provider registered: if it tried to run a turn it would throw, not return "".
  expect(await titleFromText("")).toBe("");
  expect(await titleFromText("   \n\t  ")).toBe("");
});

test("dispatchTitle routes anthropic to the Claude SDK runner — pi is NOT invoked", async () => {
  // The compliance gate: an anthropic title must NOT touch pi's createAgentSession.
  const claude = vi.fn(async () => "Claude Title");
  const pi = vi.fn(async () => "Pi Title");
  const title = await dispatchTitle("anthropic", "excerpt", { claude, pi });
  expect(title).toBe("Claude Title");
  expect(claude).toHaveBeenCalledWith("excerpt");
  expect(pi).not.toHaveBeenCalled();
});

test("dispatchTitle routes every other provider to the pi runner — Claude is NOT invoked", async () => {
  const claude = vi.fn(async () => "Claude Title");
  const pi = vi.fn(async () => "Pi Title");
  for (const provider of ["openai-codex", "google", null]) {
    claude.mockClear();
    pi.mockClear();
    const title = await dispatchTitle(provider, "excerpt", { claude, pi });
    expect(title).toBe("Pi Title");
    expect(pi).toHaveBeenCalledWith("excerpt");
    expect(claude).not.toHaveBeenCalled();
  }
});

test("generateTitle runs a faux turn and returns a single trimmed line", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "houston-title-"));
  const faux = registerFauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      { id: "faux-1", name: "Faux 1", contextWindow: 200000, maxTokens: 8192 },
    ],
  });
  faux.setResponses([
    fauxAssistantMessage("  Quarterly Sales Deck \nignored second line", {
      stopReason: "stop",
    }),
  ]);

  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("faux", "faux-key");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  try {
    const title = await generateTitle({
      cwd,
      model: faux.getModel(),
      authStorage,
      modelRegistry,
      excerpt: "user: please build me a sales deck for Q2",
    });
    expect(title).toBe("Quarterly Sales Deck");
  } finally {
    faux.unregister();
  }
});
